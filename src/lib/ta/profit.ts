// Tactical Arbitrage — Profit & Fee Engine (PRD §7.3)
//
// Net profit formula (FR-3.1):
//   net = buyBox − retailerPrice − retailerShipping − referralFee − fbaFee
//         − monthlyStorage − inboundCost − prepCost − tax
// Rendered as $ profit, ROI %, and margin %.
//
// Fee accuracy strategy (FR-3.2): production calls Amazon SP-API Product Fees
// where eligible; this deterministic size-tier table is the fallback used for
// pre-match estimates and offline calculation.

import type { RiskFlag, SizeTier } from './types';

// ---------- Referral fees by category (incl. tricky low-price tiers, FR-3.4) ----------

interface CategoryFeeSpec {
  referral: number;
  lowPriceThreshold?: number; // buy box at or below → lower referral pct
  lowPriceReferral?: number;
}

export const CATEGORY_FEES: Record<string, CategoryFeeSpec> = {
  'Health & Household': { referral: 0.15, lowPriceThreshold: 10, lowPriceReferral: 0.08 },
  Beauty: { referral: 0.15, lowPriceThreshold: 10, lowPriceReferral: 0.08 },
  'Grocery & Gourmet': { referral: 0.15, lowPriceThreshold: 15, lowPriceReferral: 0.08 },
  'Toys & Games': { referral: 0.15 },
  'Home & Kitchen': { referral: 0.15 },
  'Pet Supplies': { referral: 0.15 },
  Electronics: { referral: 0.08 },
  'Sports & Outdoors': { referral: 0.15 },
  'Office Products': { referral: 0.15 },
  Baby: { referral: 0.15 },
};

export const CATEGORY_LIST = Object.keys(CATEGORY_FEES);

const REFERRAL_MIN_FEE = 0.3;

export function referralPctFor(category: string, buyBox: number): number {
  const spec = CATEGORY_FEES[category] ?? { referral: 0.15 };
  if (spec.lowPriceThreshold != null && spec.lowPriceReferral != null && buyBox <= spec.lowPriceThreshold) {
    return spec.lowPriceReferral;
  }
  return spec.referral;
}

export function referralFeeFor(category: string, buyBox: number): number {
  return Math.max(REFERRAL_MIN_FEE, round2(referralPctFor(category, buyBox) * buyBox));
}

// ---------- FBA fulfillment fees by size tier (2025 US table) ----------

export const FBA_FEES: Record<SizeTier, number> = {
  SMALL_STANDARD: 3.06,
  LARGE_STANDARD: 4.5, // 1–2 lb band, most common
  SMALL_OVERSIZE: 9.61,
  MEDIUM_OVERSIZE: 15.12,
};

export const SIZE_TIER_LABEL: Record<SizeTier, string> = {
  SMALL_STANDARD: 'Small standard',
  LARGE_STANDARD: 'Large standard',
  SMALL_OVERSIZE: 'Small oversize',
  MEDIUM_OVERSIZE: 'Medium oversize',
};

const MONTHLY_STORAGE_PER_CUFT = 0.78; // standard, non-Q4

export interface SizeInput {
  weightLb: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
}

export function classifySizeTier({ weightLb, lengthIn, widthIn, heightIn }: SizeInput): SizeTier {
  const dims = [lengthIn, widthIn, heightIn].sort((a, b) => b - a); // longest first
  const girth = 2 * (dims[1] + dims[2]);
  if (weightLb > 70 || dims[0] > 96 || girth > 130) return 'MEDIUM_OVERSIZE';
  if (weightLb > 20 || dims[0] > 33) return 'SMALL_OVERSIZE';
  if (lengthIn <= 18 && widthIn <= 14 && heightIn <= 8 && weightLb <= 1) return 'SMALL_STANDARD';
  return 'LARGE_STANDARD';
}

export function storageFeeFor(dims: SizeInput): number {
  const cuFt = (dims.lengthIn * dims.widthIn * dims.heightIn) / 1728;
  return round2(Math.max(0.12, cuFt * MONTHLY_STORAGE_PER_CUFT));
}

// ---------- Risk flags (FR-4.2) ----------

export interface RiskInput {
  gated: boolean;
  hazmat: boolean;
  meltable: boolean;
  fragile: boolean;
  ipClaim: boolean;
  amazonRetail: boolean;
  sizeTier: SizeTier;
  totalOffers: number;
}

export function riskFlagsFor(input: RiskInput): RiskFlag[] {
  const flags: RiskFlag[] = [];
  if (input.gated) flags.push('GATED');
  if (input.hazmat) flags.push('HAZMAT');
  if (input.ipClaim) flags.push('IP_CLAIM');
  if (input.amazonRetail) flags.push('AMAZON_RETAIL');
  if (input.sizeTier === 'SMALL_OVERSIZE' || input.sizeTier === 'MEDIUM_OVERSIZE') flags.push('OVERSIZE');
  if (input.meltable) flags.push('MELTABLE');
  if (input.fragile) flags.push('FRAGILE');
  if (input.totalOffers < 3) flags.push('LOW_OFFERS');
  return flags;
}

// ---------- Full economics (FR-3.1, FR-3.5) ----------

export interface EconomicsInput {
  category: string;
  buyBox: number;
  retailerPrice: number;
  retailerShipping: number;
  taxRate: number; // 0 = tax-free sourcing state (FR-3.3)
  prepCost: number;
  inboundCost: number;
  dims: SizeInput;
  minRoi: number; // user's ROI target, fraction (0.3 = 30%)
}

export interface EconomicsResult {
  referralPct: number;
  referralFee: number;
  fbaFee: number;
  storageFee: number;
  inboundFee: number;
  prepFee: number;
  taxFee: number;
  taxRate: number;
  landedCost: number; // retailer side: price + shipping + tax
  totalCost: number; // landedCost + all Amazon-side fees
  netProfit: number;
  roiPct: number; // netProfit / landedCost
  marginPct: number; // netProfit / buyBox
  breakeven: number; // min buy box to still hit minRoi
}

export function computeEconomics(input: EconomicsInput): EconomicsResult {
  const referralPct = referralPctFor(input.category, input.buyBox);
  const referralFee = Math.max(REFERRAL_MIN_FEE, round2(referralPct * input.buyBox));
  const fbaFee = FBA_FEES[classifySizeTier(input.dims)];
  const storageFee = storageFeeFor(input.dims);
  const inboundFee = round2(input.inboundCost);
  const prepFee = round2(input.prepCost);
  const taxFee = round2(input.taxRate * input.retailerPrice);

  const landedCost = round2(input.retailerPrice + input.retailerShipping + taxFee);
  const totalCost = round2(landedCost + referralFee + fbaFee + storageFee + inboundFee + prepFee);
  const netProfit = round2(input.buyBox - totalCost);

  const roiPct = landedCost > 0 ? round2((netProfit / landedCost) * 100) : 0;
  const marginPct = input.buyBox > 0 ? round2((netProfit / input.buyBox) * 100) : 0;

  // Breakeven (FR-3.5): buyBox* such that ROI = minRoi.
  // net = bb·(1−refPct) − C  where C = landed + fba + storage + inbound + prep
  // ROI: net / landed = minRoi → bb* = (minRoi·landed + C) / (1 − refPct)
  const C = landedCost + fbaFee + storageFee + inboundFee + prepFee;
  const breakeven = round2((input.minRoi * landedCost + C) / Math.max(0.05, 1 - referralPct));

  return {
    referralPct,
    referralFee,
    fbaFee,
    storageFee,
    inboundFee,
    prepFee,
    taxFee,
    taxRate: input.taxRate,
    landedCost,
    totalCost,
    netProfit,
    roiPct,
    marginPct,
    breakeven,
  };
}

// ---------- Deal score (0..100) ----------

export function dealScore(input: {
  roiPct: number;
  netProfit: number;
  bsr: number;
  discountPct: number;
  riskFlags: RiskFlag[];
}): number {
  const roiScore = Math.min(1, Math.max(0, input.roiPct / 100)) * 40;
  const profitScore = Math.min(1, Math.max(0, input.netProfit / 25)) * 30;
  // BSR: log-ish curve — 500 → ~1.0, 150k → ~0.5, 1M+ → ~0.15
  const bsrNorm = 1 / (1 + Math.log10(Math.max(10, input.bsr) / 100) / 2.2);
  const bsrScore = Math.min(1, Math.max(0.05, bsrNorm)) * 15;
  const discountScore = Math.min(1, Math.max(0, input.discountPct / 60)) * 10;
  const riskPenalty =
    input.riskFlags.filter((f) => ['GATED', 'HAZMAT', 'IP_CLAIM'].includes(f)).length * 6 +
    input.riskFlags.filter((f) => ['AMAZON_RETAIL', 'OVERSIZE', 'MELTABLE'].includes(f)).length * 3 +
    input.riskFlags.filter((f) => ['FRAGILE', 'LOW_OFFERS'].includes(f)).length * 1.5;
  return round1(Math.max(0, Math.min(100, roiScore + profitScore + bsrScore + discountScore - riskPenalty)));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function fmtPct(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(digits)}%`;
}
