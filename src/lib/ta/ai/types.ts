// AI-First v2.2 — shared AI layer types (picks, reasons, confidence, health, NL)

import type { LeadFilters, RiskFlag } from '../types';

export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';

export type PersonalizationStrength = 'NONE' | 'WEAK' | 'STRONG';

/** One evidence-linked factor behind a pick (§1: every claim traces to data). */
export interface ReasonFactor {
  key: 'profit' | 'roi' | 'demand' | 'discount' | 'stability' | 'risk' | 'personalization' | 'freshness';
  label: string; // human-readable claim, e.g. "Net profit $12.40 after all fees"
  evidence: string; // concrete data trace, e.g. "buy box $34.99 − total cost $22.59"
  weight: number; // contribution to ranking decision (0..1 normalized)
}

export interface CalibratedConfidence {
  p: number; // predicted win probability 0..1
  band: ConfidenceBand;
  sampleSize: number; // outcomes behind this calibration
  method: 'outcome-calibrated' | 'global-prior'; // prior when < 20 outcomes (§5 cold start)
}

export interface PickDTO {
  leadId: string;
  rank: number;
  aiScore: number; // 0..100 hybrid ranking score
  baseScore: number; // deterministic platform deal score
  confidence: CalibratedConfidence;
  reason: string; // one-line evidence-linked reason (always visible, US-1)
  factors: ReasonFactor[]; // full evidence chain (progressive disclosure, US-3)
  personalization: PersonalizationStrength;
  lead: {
    id: string;
    asin: string;
    title: string;
    brand: string;
    category: string;
    imageUrl: string;
    retailerId: string;
    retailerName: string;
    retailerPrice: number;
    buyBox: number;
    netProfit: number;
    roiPct: number;
    marginPct: number;
    breakeven: number;
    discountPct: number;
    bsr: number;
    fbaOffers: number;
    riskFlags: string;
    score: number;
    priceAgeH: number;
    fresh: boolean;
    firstSeenAt: string;
  };
  inPipeline: boolean;
  estMonthlySales: number; // deterministic BSR-derived estimate (§12 resolved: shown, labeled est.)
}

export interface PicksMeta {
  generatedAt: string;
  cached: boolean;
  stale: boolean; // served from an old snapshot (offline-tolerance, §7)
  coldStart: boolean; // global priors / safe mode active (§5)
  safeMode: boolean;
  personalization: PersonalizationStrength;
  outcomeCount: number;
  health: AccountHealthDTO;
  rankMs: number;
  reasonMs: number;
  excludedStale: number;
  excludedSuppressed: number;
}

export interface PicksResponse {
  picks: PickDTO[];
  meta: PicksMeta;
}

export type HealthLabel = 'HEALTHY' | 'WATCH' | 'AT_RISK' | 'CRITICAL';

export interface AccountHealthDTO {
  score: number; // 0..100
  label: HealthLabel;
  reasons: string[]; // visible reason per §5 Account Health
  suggestions: { scope: 'RETURN' | 'GATING' | 'IP'; value: string; reason: string }[];
  enforceFlags: RiskFlag[]; // flags excluded from ranking at this health level
  forcedSafeMode: boolean;
  returnRate: number;
  gatedBuys: number;
  ipBuys: number;
  sampleSize: number;
}

export interface NlChip {
  kind: 'category' | 'price' | 'profit' | 'roi' | 'confidence' | 'recency' | 'brand' | 'retailer' | 'bsr' | 'flag' | 'sort' | 'search';
  label: string; // display chip, e.g. "Electronics", "under $35", "high confidence"
}

export interface NlParseResult {
  filters: LeadFilters; // maps onto the deterministic deal-store query
  sort: string;
  minConfidence: ConfidenceBand | null;
  recencyHours: number | null;
  chips: NlChip[];
  unmatched: string[]; // tokens we could not interpret (shown honestly, never guessed)
}

export interface AiStatusDTO {
  latency: {
    rankP95Ms: number;
    reasonP95Ms: number;
    nlP95Ms: number;
    samples: number;
    budgetRankMs: number; // 2000 per §3
    budgetReasonMs: number; // 5000 per §3
  };
  eval: {
    ndcg10: number;
    precision10: number;
    winRateAi: number;
    winRateNonAi: number;
    roiLiftPct: number;
    sampleSize: number;
    drift: boolean;
    computedAt: string | null;
  };
  learning: {
    outcomeCoveragePct: number; // % of purchases with logged outcome (target ≥ 80%)
    totalOutcomes: number;
    imputedShare: number;
    personalizationStrength: PersonalizationStrength;
  };
  cost: {
    perRecommendationUsd: number; // tiered-model cost estimate (§5 latency & cost)
    modelTier: string;
  };
}
