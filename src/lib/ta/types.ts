// Tactical Arbitrage — shared domain types (PRD §7 vocabulary)

export type RiskFlag =
  | 'GATED'
  | 'HAZMAT'
  | 'OVERSIZE'
  | 'MELTABLE'
  | 'FRAGILE'
  | 'IP_CLAIM'
  | 'AMAZON_RETAIL'
  | 'LOW_OFFERS';

export type SizeTier = 'SMALL_STANDARD' | 'LARGE_STANDARD' | 'SMALL_OVERSIZE' | 'MEDIUM_OVERSIZE';

export type MatchMethod = 'GTIN' | 'FUZZY';
export type MatchStatus = 'AUTO_ACCEPTED' | 'REVIEW' | 'REJECTED';

export type PipelineStatus = 'NEW' | 'INTERESTED' | 'PURCHASED' | 'SHIPPED' | 'LIVE' | 'WON' | 'LOST';

export const PIPELINE_STATUSES: PipelineStatus[] = [
  'NEW',
  'INTERESTED',
  'PURCHASED',
  'SHIPPED',
  'LIVE',
  'WON',
  'LOST',
];

export type Plan = 'STARTER' | 'PRO' | 'EXPERT';

export type ScanSchedule = 'every_2h' | 'every_12h' | 'daily' | 'weekly' | 'manual';

export const SCHEDULE_LABELS: Record<ScanSchedule, string> = {
  every_2h: 'Every 2 hours',
  every_12h: 'Every 12 hours',
  daily: 'Daily',
  weekly: 'Weekly',
  manual: 'Manual only',
};

// ---------- Lead filters (PRD FR-4.1 / FR-4.4) ----------

export interface LeadFilters {
  categories: string[];
  retailers: string[]; // retailer ids
  minPrice: number | null;
  maxPrice: number | null;
  minProfit: number | null;
  minRoi: number | null;
  maxRoi: number | null;
  minBsr: number | null;
  maxBsr: number | null;
  minFbaOffers: number | null;
  maxFbaOffers: number | null;
  amazonOnListing: 'any' | 'exclude' | 'only';
  minDiscount: number | null;
  excludeFlags: RiskFlag[];
  requireFresh: boolean;
  search: string;
}

export const DEFAULT_FILTERS: LeadFilters = {
  categories: [],
  retailers: [],
  minPrice: null,
  maxPrice: null,
  minProfit: null,
  minRoi: null,
  maxRoi: null,
  minBsr: null,
  maxBsr: null,
  minFbaOffers: null,
  maxFbaOffers: null,
  amazonOnListing: 'any',
  minDiscount: null,
  excludeFlags: [],
  requireFresh: true,
  search: '',
};

export function sanitizeFilters(raw: unknown): LeadFilters {
  const f = (raw ?? {}) as Partial<LeadFilters>;
  const num = (v: unknown): number | null => {
    const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return {
    categories: strArr(f.categories),
    retailers: strArr(f.retailers),
    minPrice: num(f.minPrice),
    maxPrice: num(f.maxPrice),
    minProfit: num(f.minProfit),
    minRoi: num(f.minRoi),
    maxRoi: num(f.maxRoi),
    minBsr: num(f.minBsr),
    maxBsr: num(f.maxBsr),
    minFbaOffers: num(f.minFbaOffers),
    maxFbaOffers: num(f.maxFbaOffers),
    amazonOnListing: f.amazonOnListing === 'exclude' || f.amazonOnListing === 'only' ? f.amazonOnListing : 'any',
    minDiscount: num(f.minDiscount),
    excludeFlags: strArr(f.excludeFlags).filter((x): x is RiskFlag =>
      ['GATED', 'HAZMAT', 'OVERSIZE', 'MELTABLE', 'FRAGILE', 'IP_CLAIM', 'AMAZON_RETAIL', 'LOW_OFFERS'].includes(x)
    ),
    requireFresh: f.requireFresh !== false,
    search: typeof f.search === 'string' ? f.search.slice(0, 120) : '',
  };
}

export function filtersEqual(a: LeadFilters, b: LeadFilters): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------- Plans (PRD FR-9.1 / FR-9.2) ----------

export interface PlanSpec {
  id: Plan;
  name: string;
  price: number;
  annualPrice: number; // per month billed annually (2 months free)
  marketplaces: number;
  savedScans: number | null; // null = unlimited
  subAccounts: number;
  api: boolean;
  extension: boolean;
  digests: boolean;
  concurrentScanSlots: number;
  blurb: string;
}

export const PLANS: Record<Plan, PlanSpec> = {
  STARTER: {
    id: 'STARTER',
    name: 'Starter',
    price: 59,
    annualPrice: 49,
    marketplaces: 1,
    savedScans: 5,
    subAccounts: 0,
    api: false,
    extension: false,
    digests: false,
    concurrentScanSlots: 1,
    blurb: 'Part-time sellers getting off spreadsheets.',
  },
  PRO: {
    id: 'PRO',
    name: 'Pro',
    price: 99,
    annualPrice: 82,
    marketplaces: 3,
    savedScans: 25,
    subAccounts: 2,
    api: false,
    extension: true,
    digests: true,
    concurrentScanSlots: 4,
    blurb: 'Scaling sellers running VAs on repeat playbooks.',
  },
  EXPERT: {
    id: 'EXPERT',
    name: 'Expert',
    price: 159,
    annualPrice: 132,
    marketplaces: 4,
    savedScans: null,
    subAccounts: 10,
    api: true,
    extension: true,
    digests: true,
    concurrentScanSlots: 10,
    blurb: 'Multi-market operators who live in the data.',
  },
};

// ---------- Scan simulation ----------

export interface ScanRunSummary {
  runId: string;
  jobs: {
    retailer: string;
    status: string;
    pages: number;
    skus: number;
    newLeads: number;
    priceUpdates: number;
    errors: number;
  }[];
  totals: { jobs: number; pages: number; skus: number; newLeads: number; priceUpdates: number; errors: number };
  durationMs: number;
  queuePosition: number;
}

// ---------- Misc ----------

export const RISK_FLAG_META: Record<RiskFlag, { label: string; desc: string; severity: 'high' | 'medium' | 'low' }> = {
  GATED: { label: 'Gated', desc: 'Brand/category requires Amazon approval before you can sell it.', severity: 'high' },
  HAZMAT: { label: 'Hazmat', desc: 'Flammable/aerosol — restricted FBA storage and shipping.', severity: 'high' },
  IP_CLAIM: { label: 'IP risk', desc: 'Brand has intellectual-property claim history on Amazon.', severity: 'high' },
  AMAZON_RETAIL: { label: 'Amazon Retail', desc: 'Amazon itself sells on this listing — expect buy-box suppression.', severity: 'medium' },
  OVERSIZE: { label: 'Oversize', desc: 'Exceeds standard size tiers — much higher fulfillment fees.', severity: 'medium' },
  MELTABLE: { label: 'Meltable', desc: 'Melts in transit — FBA refuses Apr–Oct without refrigerated shipping.', severity: 'medium' },
  FRAGILE: { label: 'Fragile', desc: 'Breakage risk — add prep cost and expect damage returns.', severity: 'low' },
  LOW_OFFERS: { label: 'Low offers', desc: 'Fewer than 3 sellers on listing — verify demand before buying.', severity: 'low' },
};

export function parseJsonArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
