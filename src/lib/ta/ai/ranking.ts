// AI-First v2.2 — hybrid ranking + calibrated confidence + evidence-linked reasons.
//
// Design mandates from the PRD:
//  - NOT black-box (§9): every score is a deterministic blend the user can audit;
//    every pick carries a reason + full evidence chain (§1 evidence-linked reasoning).
//  - Calibrated confidence (§1, §5): confidence maps to *observed win rates* from
//    logged outcomes, with a global prior while outcome volume < 20 (cold start).
//  - Personalization gated by outcome volume (§5): 20–30 weak, 100+ strong.
//  - Account health outweighs pure ROI (§5): health penalty + enforced flag exclusions.
//  - Stale recommendations are suppressed, never shown as fresh (§1 graceful degradation).
//  - Permanent suppression taxonomy (§5): brand, category, retailer, ASIN, IP, return, gating.

import { parseJsonArray } from '../types';
import { round1 } from '../profit';
import { tierSlaHours } from '../leadEngine';
import type { Lead, Outcome, Settings, Suppression } from '@prisma/client';
import type { AccountHealthDTO, CalibratedConfidence, ConfidenceBand, PickDTO, PersonalizationStrength, ReasonFactor } from './types';

// ---------- Calibration (§1/§5) ----------

export interface CalibrationBin {
  wins: number;
  n: number;
}

export interface CalibrationTable {
  bins: Record<string, CalibrationBin>; // key = band bucket
  globalWins: number;
  globalN: number;
  totalOutcomes: number;
}

const BINS: { key: string; min: number }[] = [
  { key: '85+', min: 85 },
  { key: '70-84', min: 70 },
  { key: '55-69', min: 55 },
  { key: '40-54', min: 40 },
  { key: '<40', min: 0 },
];

function binKeyFor(score: number): string {
  for (const b of BINS) if (score >= b.min) return b.key;
  return '<40';
}

/**
 * Build win-rate bins from logged outcomes. Outcomes attach to leads; the lead's
 * platform score at decision time is the calibration feature (deterministic, auditable).
 */
export function buildCalibration(outcomes: Outcome[], winByLead: Map<string, boolean>, scoreByLead: Map<string, number>): CalibrationTable {
  const table: CalibrationTable = { bins: {}, globalWins: 0, globalN: 0, totalOutcomes: outcomes.length };
  for (const b of BINS) table.bins[b.key] = { wins: 0, n: 0 };
  for (const o of outcomes) {
    const win = winByLead.get(o.leadId);
    const score = scoreByLead.get(o.leadId);
    if (win == null || score == null) continue;
    // only purchase-type outcomes calibrate the ranking signal
    if (!['BOUGHT', 'MULTI_UNIT', 'PARTIAL', 'RETURNED'].includes(o.type)) continue;
    const key = binKeyFor(score);
    table.bins[key].n += 1;
    if (win) table.bins[key].wins += 1;
    table.globalN += 1;
    if (win) table.globalWins += 1;
  }
  return table;
}

/** Laplace-smoothed (Beta(2,2) prior) win probability for a lead score. */
export function calibratedConfidence(score: number, table: CalibrationTable): CalibratedConfidence {
  if (table.totalOutcomes < 20) {
    // Cold start: global prior from the platform score itself — honest and conservative.
    const p = Math.max(0.2, Math.min(0.92, 0.3 + 0.55 * (score / 100)));
    return { p: Math.round(p * 100) / 100, band: bandFor(p), sampleSize: table.totalOutcomes, method: 'global-prior' };
  }
  const bin = table.bins[binKeyFor(score)];
  const binRate = (bin.wins + 2) / (bin.n + 4);
  const globalRate = (table.globalWins + 2) / (table.globalN + 4);
  // Shrink sparse bins toward the global mean (standard calibration practice) —
  // keeps confidence monotone without over-reacting to tiny samples.
  const p = bin.n >= 15 ? binRate : 0.5 * binRate + 0.5 * globalRate;
  return { p: Math.round(p * 100) / 100, band: bandFor(p), sampleSize: bin.n, method: 'outcome-calibrated' };
}

export function bandFor(p: number): ConfidenceBand {
  if (p >= 0.7) return 'HIGH';
  if (p >= 0.5) return 'MEDIUM';
  return 'LOW';
}

// ---------- Suppression (§5 taxonomy) ----------

export interface SuppressionLists {
  brands: Set<string>;
  categories: Set<string>;
  retailers: Set<string>;
  asins: Set<string>;
  suppressIp: boolean;
  suppressGating: boolean;
  returnCategories: Set<string>;
}

export function buildSuppressionLists(suppressions: Suppression[]): SuppressionLists {
  const lists: SuppressionLists = {
    brands: new Set(),
    categories: new Set(),
    retailers: new Set(),
    asins: new Set(),
    suppressIp: false,
    suppressGating: false,
    returnCategories: new Set(),
  };
  for (const s of suppressions) {
    const v = s.value.trim();
    if (s.scope === 'BRAND') lists.brands.add(v.toLowerCase());
    else if (s.scope === 'CATEGORY') lists.categories.add(v);
    else if (s.scope === 'RETAILER') lists.retailers.add(v.toLowerCase());
    else if (s.scope === 'ASIN') lists.asins.add(v.toUpperCase());
    else if (s.scope === 'IP') lists.suppressIp = true;
    else if (s.scope === 'GATING') lists.suppressGating = true;
    else if (s.scope === 'RETURN' && v !== '*') lists.returnCategories.add(v);
  }
  return lists;
}

// ---------- Personalization (§5, gated by outcome volume) ----------

export interface CategoryAffinity {
  pointsByCategory: Map<string, number>;
  winsByCategory: Map<string, { w: number; n: number }>;
  strength: PersonalizationStrength;
  globalRate: number;
}

export function buildAffinity(outcomes: Outcome[], winByLead: Map<string, boolean>, categoryByLead: Map<string, string>, strength: PersonalizationStrength): CategoryAffinity {
  const winsByCategory = new Map<string, { w: number; n: number }>();
  let gw = 0;
  let gn = 0;
  for (const o of outcomes) {
    const win = winByLead.get(o.leadId);
    const cat = categoryByLead.get(o.leadId);
    if (win == null || !cat) continue;
    if (!['BOUGHT', 'MULTI_UNIT', 'PARTIAL', 'RETURNED'].includes(o.type)) continue;
    const rec = winsByCategory.get(cat) ?? { w: 0, n: 0 };
    rec.n += 1;
    if (win) rec.w += 1;
    winsByCategory.set(cat, rec);
    gw += win ? 1 : 0;
    gn += 1;
  }
  const globalRate = gn > 0 ? gw / gn : 0.55;
  const pointsByCategory = new Map<string, number>();
  if (strength !== 'NONE' && gn >= 5) {
    const mult = strength === 'STRONG' ? 1 : 0.5;
    for (const [cat, { w, n }] of winsByCategory) {
      const rate = (w + 1) / (n + 2);
      const pts = Math.max(-6, Math.min(8, (rate - globalRate) * 22)) * mult;
      pointsByCategory.set(cat, Math.round(pts * 10) / 10);
    }
  }
  return { pointsByCategory, winsByCategory, strength, globalRate: Math.round(globalRate * 100) / 100 };
}

// ---------- Demand estimate (§12 resolved: show estimated sales, labeled "est.") ----------

export function estMonthlySales(bsr: number): number {
  return Math.max(3, Math.min(600, Math.round(300000 / Math.max(300, bsr))));
}

// ---------- Reason building (§1 evidence-linked, §10 one-line by default) ----------

export interface ReasonContext {
  listing?: { priceStability: number; keepa30Avg: number; rankTrend: string };
  affinity: CategoryAffinity;
  minRoi: number;
  priceAgeH: number;
}

export function buildReasons(lead: Lead, confidence: CalibratedConfidence, ctx: ReasonContext): { reason: string; factors: ReasonFactor[] } {
  const factors: ReasonFactor[] = [];
  const money = (n: number) => `$${n.toFixed(2)}`;

  // 1. Profit — the anchor claim.
  if (lead.netProfit > 0) {
    factors.push({
      key: 'profit',
      label: `${money(lead.netProfit)} net profit after all Amazon fees`,
      evidence: `buy box ${money(lead.buyBox)} − fully landed cost ${money(lead.totalCost)} (referral ${money(lead.referralFee)}, FBA ${money(lead.fbaFee)}, tax ${money(lead.taxFee)} included)`,
      weight: Math.min(1, lead.netProfit / 25) * 0.3,
    });
  }
  // 2. ROI vs target.
  if (lead.roiPct >= ctx.minRoi) {
    factors.push({
      key: 'roi',
      label: `${Math.round(lead.roiPct)}% ROI vs your ${Math.round(ctx.minRoi)}% target`,
      evidence: `profit ${money(lead.netProfit)} ÷ landed cost ${money(lead.retailerPrice + lead.retailerShipping + lead.taxFee)}`,
      weight: Math.min(1, lead.roiPct / 100) * 0.4,
    });
  }
  // 3. Price position vs 30-day average (Keepa-style evidence).
  const l = ctx.listing;
  if (l && l.keepa30Avg > 0) {
    const delta = (lead.buyBox - l.keepa30Avg) / l.keepa30Avg;
    if (delta <= -0.03) {
      factors.push({
        key: 'stability',
        label: `buy box is ${Math.round(-delta * 100)}% under its 30-day average (${money(l.keepa30Avg)})`,
        evidence: `90-day Keepa-style history · price stability ${Math.round(l.priceStability * 100)}% · trend ${l.rankTrend}`,
        weight: Math.min(1, -delta * 4) * 0.15,
      });
    } else if (l.priceStability >= 0.8) {
      factors.push({
        key: 'stability',
        label: `price history is stable (${Math.round(l.priceStability * 100)}% stability)`,
        evidence: `30-day avg ${money(l.keepa30Avg)} vs current ${money(lead.buyBox)} — low repricing risk`,
        weight: 0.1,
      });
    }
  }
  // 4. Discount depth.
  if (lead.discountPct >= 20) {
    factors.push({
      key: 'discount',
      label: `${Math.round(lead.discountPct)}% below list price`,
      evidence: `retailer ${money(lead.retailerPrice)} vs list ${money(lead.listPrice)}${lead.couponPct > 0 ? ` + ${lead.couponPct}% coupon` : ''}`,
      weight: Math.min(1, lead.discountPct / 60) * 0.1,
    });
  }
  // 5. Personalization evidence (only when earned).
  const wins = ctx.affinity.winsByCategory.get(lead.category);
  if (wins && wins.n >= 3) {
    const pts = ctx.affinity.pointsByCategory.get(lead.category) ?? 0;
    if (pts > 0.5) {
      factors.push({
        key: 'personalization',
        label: `you win ${Math.round((wins.w / wins.n) * 100)}% of the time in ${lead.category} (${wins.n} logged purchases)`,
        evidence: 'outcome-logged category affinity — raises this pick in your ranking',
        weight: Math.min(0.1, pts / 100),
      });
    }
  }
  // 6. Freshness.
  const ageLabel = lead.priceAgeH < 1 ? 'just now' : lead.priceAgeH < 48 ? `${Math.round(lead.priceAgeH)}h ago` : `${Math.round(lead.priceAgeH / 24)}d ago`;
  factors.push({
    key: 'freshness',
    label: `price verified ${ageLabel} at ${lead.retailerName}`,
    evidence: `scan SLA for tier-${lead.retailerTier} retailers: every ${tierSlaHours(lead.retailerTier)}h`,
    weight: 0.05,
  });
  // 7. Risk — negative factor, always visible if present.
  const flags = parseJsonArray(lead.riskFlags);
  if (flags.length > 0) {
    factors.push({
      key: 'risk',
      label: `risk flags: ${flags.join(', ').replace(/_/g, ' ').toLowerCase()}`,
      evidence: 'listed on the Amazon catalog snapshot — review before buying',
      weight: -0.12 * flags.length,
    });
  }

  // One-line reason (US-1): the two strongest positive claims + confidence.
  const positives = factors.filter((f) => f.weight > 0).sort((a, b) => b.weight - a.weight);
  const parts = positives.slice(0, 2).map((f) => f.label);
  if (parts.length === 0) parts.push(factors[0]?.label ?? 'matched lead from your scans');
  const reason = parts.join(' · ');
  return { reason, factors };
}

// ---------- Ranking pipeline ----------

export interface RankCandidateInput {
  leads: Lead[];
  listings: Map<string, { priceStability: number; keepa30Avg: number; rankTrend: string }>;
  calibration: CalibrationTable;
  affinity: CategoryAffinity;
  suppressions: SuppressionLists;
  health: AccountHealthDTO;
  settings: Settings;
}

export interface RankOutput {
  ranked: { lead: Lead; aiScore: number; confidence: CalibratedConfidence }[];
  excludedStale: number;
  excludedSuppressed: number;
}

function isStale(lead: Lead): boolean {
  const sla = tierSlaHours(lead.retailerTier);
  return !lead.fresh || lead.priceAgeH > 2 * sla; // §5: auto-suppress beyond 2× SLA
}

function isSuppressed(lead: Lead, lists: SuppressionLists): boolean {
  const flags = parseJsonArray(lead.riskFlags);
  if (lists.brands.has(lead.brand.toLowerCase())) return true;
  if (lists.categories.has(lead.category)) return true;
  if (lists.retailers.has(lead.retailerName.toLowerCase())) return true;
  if (lists.asins.has(lead.asin.toUpperCase())) return true;
  if (lists.suppressIp && flags.includes('IP_CLAIM')) return true;
  if (lists.suppressGating && flags.includes('GATED')) return true;
  if (lists.returnCategories.has(lead.category)) return true;
  return false;
}

const HIGH_SEVERITY: string[] = ['GATED', 'HAZMAT', 'IP_CLAIM'];
const MED_SEVERITY: string[] = ['AMAZON_RETAIL', 'OVERSIZE', 'MELTABLE'];

export function rankCandidates(input: RankCandidateInput): RankOutput {
  const { leads, listings, calibration, affinity, suppressions, health, settings } = input;
  const coldStart = !settings.onboarded;
  const safeMode = coldStart || health.forcedSafeMode;

  // Risk tolerance thresholds (onboarding §4 / §5).
  const tolerance = settings.riskTolerance === 'conservative' || safeMode ? 'conservative' : settings.riskTolerance;
  const priceCap = tolerance === 'conservative' ? 40 : tolerance === 'aggressive' ? 80 : 55;
  const profitFloor = tolerance === 'aggressive' ? 4 : 5;
  const roiFloor = tolerance === 'aggressive' ? 25 : 30;

  // Health enforcement ladder (§5: account health outweighs pure ROI).
  const enforceFlags = new Set<string>([...health.enforceFlags]);
  if (safeMode) HIGH_SEVERITY.forEach((f) => enforceFlags.add(f));

  const healthPenalty = health.score >= 80 ? 0 : Math.min(25, Math.round((80 - health.score) * 0.45));

  let excludedStale = 0;
  let excludedSuppressed = 0;
  const ranked: RankOutput['ranked'] = [];

  for (const lead of leads) {
    if (isStale(lead)) {
      excludedStale += 1;
      continue;
    }
    if (isSuppressed(lead, suppressions)) {
      excludedSuppressed += 1;
      continue;
    }
    const flags = parseJsonArray(lead.riskFlags);
    if (flags.some((f) => enforceFlags.has(f))) {
      excludedSuppressed += 1;
      continue;
    }
    // Candidate floors — safe mode / tolerance shape the funnel (§5 cold start).
    if (lead.netProfit < profitFloor || lead.roiPct < roiFloor || lead.retailerPrice > priceCap) continue;
    if (tolerance === 'conservative' && flags.some((f) => MED_SEVERITY.includes(f))) continue;

    const base = lead.score;
    const pers = affinity.pointsByCategory.get(lead.category) ?? 0;
    const aiScore = Math.max(0, Math.min(100, round1(base + pers - healthPenalty)));
    const confidence = calibratedConfidence(base, calibration);
    ranked.push({ lead, aiScore, confidence });
  }

  ranked.sort((a, b) => b.aiScore - a.aiScore || b.confidence.p - a.confidence.p);
  return { ranked, excludedStale, excludedSuppressed };
}

export { isStale, isSuppressed, binKeyFor };
