// Account health scoring (§5 Account Health / §1 "Account health > theoretical ROI").
//
// The score is derived from realized outcomes (returns, gated/IP purchases,
// cancellations) — never from theoretical ROI. It produces:
//   - a 0..100 score with a visible reason for every deduction
//   - suppression *suggestions* (human stays in control — user must confirm)
//   - enforcement rules the ranking layer must apply (health outweighs ROI)

import { db } from '@/lib/db';
import { parseJsonArray } from '../types';
import type { RiskFlag } from '../types';
import type { AccountHealthDTO, HealthLabel } from './types';

const LOOKBACK_DAYS = 30;

export async function computeAccountHealth(): Promise<AccountHealthDTO> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000);
  const outcomes = await db.outcome.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const reasons: string[] = [];
  const suggestions: AccountHealthDTO['suggestions'] = [];

  if (outcomes.length === 0) {
    return {
      score: 100,
      label: 'HEALTHY',
      reasons: ['No purchases logged in the last 30 days — no health risk signals yet.'],
      suggestions: [],
      enforceFlags: [],
      forcedSafeMode: false,
      returnRate: 0,
      gatedBuys: 0,
      ipBuys: 0,
      sampleSize: 0,
    };
  }

  // Resolve lead context (flags, category) for the outcome set in one batch.
  const leadIds = Array.from(new Set(outcomes.map((o) => o.leadId)));
  const leads = await db.lead.findMany({
    where: { id: { in: leadIds } },
    select: { id: true, category: true, riskFlags: true },
  });
  const leadById = new Map(leads.map((l) => [l.id, l]));

  let unitsSold = 0;
  let unitsReturned = 0;
  let gatedBuys = 0;
  let ipBuys = 0;
  let cancelled = 0;
  const returnsByCategory = new Map<string, number>();
  const soldByCategory = new Map<string, number>();

  for (const o of outcomes) {
    const lead = leadById.get(o.leadId);
    const flags: string[] = lead ? parseJsonArray(lead.riskFlags) : [];
    if (o.type === 'CANCELLED') cancelled += 1;
    if (o.type === 'RETURNED') {
      unitsReturned += Math.max(1, o.unitsReturned || o.units);
      if (lead) returnsByCategory.set(lead.category, (returnsByCategory.get(lead.category) ?? 0) + 1);
    }
    if (o.type === 'BOUGHT' || o.type === 'MULTI_UNIT' || o.type === 'PARTIAL') {
      unitsSold += o.unitsSold || o.units;
      if (lead) soldByCategory.set(lead.category, (soldByCategory.get(lead.category) ?? 0) + 1);
      if (flags.includes('GATED')) gatedBuys += 1;
      if (flags.includes('IP_CLAIM')) ipBuys += 1;
    }
  }

  let score = 100;

  const totalUnits = unitsSold + unitsReturned;
  const returnRate = totalUnits > 0 ? unitsReturned / totalUnits : 0;
  if (returnRate > 0.1) {
    const penalty = Math.min(30, Math.round(returnRate * 150));
    score -= penalty;
    reasons.push(
      `Return rate ${(returnRate * 100).toFixed(0)}% over the last 30 days (${unitsReturned} of ${totalUnits} units) — Amazon tracks returns per seller; above 10% invites scrutiny. (−${penalty})`
    );
    // worst return-prone category with at least 2 outcomes
    let worstCat: string | null = null;
    let worstRate = 0;
    for (const [cat, ret] of returnsByCategory) {
      const sold = soldByCategory.get(cat) ?? 0;
      const n = ret + sold;
      if (n >= 2 && ret / n > worstRate) {
        worstRate = ret / n;
        worstCat = cat;
      }
    }
    if (worstCat && worstRate > 0.25) {
      suggestions.push({
        scope: 'RETURN',
        value: worstCat,
        reason: `${Math.round(worstRate * 100)}% of your ${worstCat} purchases came back — suppressing this category protects your account health.`,
      });
    }
  }

  if (gatedBuys > 0) {
    const penalty = Math.min(24, gatedBuys * 8);
    score -= penalty;
    reasons.push(
      `${gatedBuys} purchase${gatedBuys > 1 ? 's' : ''} in gated brands/categories — unstaged gating can wipe listings. (−${penalty})`
    );
    suggestions.push({
      scope: 'GATING',
      value: '*',
      reason: 'Suppress all gated picks so no unapproved brand reaches your buy list.',
    });
  }

  if (ipBuys > 0) {
    const penalty = Math.min(24, ipBuys * 12);
    score -= penalty;
    reasons.push(
      `${ipBuys} purchase${ipBuys > 1 ? 's' : ''} on brands with IP-claim history — one complaint can suspend the account. (−${penalty})`
    );
    suggestions.push({
      scope: 'IP',
      value: '*',
      reason: 'Suppress picks carrying the IP-risk flag.',
    });
  }

  const cancelRate = cancelled / outcomes.length;
  if (cancelRate > 0.15) {
    score -= 10;
    reasons.push(
      `${cancelled} cancelled orders in 30 days — cancellations count against order defect rate. (−10)`
    );
  }

  if (reasons.length === 0) {
    reasons.push(`Clean 30-day record across ${outcomes.length} logged outcomes — keep logging outcomes to keep the model honest.`);
  }

  score = Math.max(0, Math.min(100, score));
  const label: HealthLabel = score >= 80 ? 'HEALTHY' : score >= 60 ? 'WATCH' : score >= 40 ? 'AT_RISK' : 'CRITICAL';

  // Enforcement ladder — health outweighs pure ROI (§5):
  const enforceFlags: RiskFlag[] = [];
  if (score < 80) enforceFlags.push('IP_CLAIM');
  if (score < 60) enforceFlags.push('GATED', 'HAZMAT');
  const forcedSafeMode = score < 35;

  return {
    score,
    label,
    reasons,
    suggestions,
    enforceFlags,
    forcedSafeMode,
    returnRate: Math.round(returnRate * 1000) / 1000,
    gatedBuys,
    ipBuys,
    sampleSize: outcomes.length,
  };
}

export function personalizationStrength(outcomeCount: number): 'NONE' | 'WEAK' | 'STRONG' {
  // §5 Cold Start: personalization gated by outcome volume (20–30 weak, 100+ strong).
  if (outcomeCount >= 100) return 'STRONG';
  if (outcomeCount >= 20) return 'WEAK';
  return 'NONE';
}
