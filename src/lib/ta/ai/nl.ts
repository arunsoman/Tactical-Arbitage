// AI-First v2.2 — natural-language deal queries (§4 US-5, §5 Natural Language).
//
// Deterministic grammar → LeadFilters. No black-box: every recognized intent
// becomes a visible chip; anything not understood is surfaced in `unmatched`
// rather than guessed (§1 evidence-linked, human control first).
//
// Examples:
//   "new electronics under $35 high confidence last 8 hours"
//   "pet supplies over $20 highest profit no gated from Chewy"
//   "grocery 30%+ roi bsr under 50000 fresh today"

import { DEFAULT_FILTERS } from '../types';
import { CATEGORY_LIST } from '../profit';
import type { LeadFilters, RiskFlag } from '../types';
import type { ConfidenceBand, NlChip, NlParseResult } from './types';

const CATEGORY_ALIASES: Record<string, string> = {
  electronics: 'Electronics',
  electronic: 'Electronics',
  tech: 'Electronics',
  grocery: 'Grocery & Gourmet',
  food: 'Grocery & Gourmet',
  gourmet: 'Grocery & Gourmet',
  beauty: 'Beauty',
  cosmetics: 'Beauty',
  toys: 'Toys & Games',
  games: 'Toys & Games',
  home: 'Home & Kitchen',
  kitchen: 'Home & Kitchen',
  pet: 'Pet Supplies',
  pets: 'Pet Supplies',
  sports: 'Sports & Outdoors',
  outdoors: 'Sports & Outdoors',
  outdoor: 'Sports & Outdoors',
  office: 'Office Products',
  baby: 'Baby',
  health: 'Health & Household',
  wellness: 'Health & Household',
  supplements: 'Health & Household',
  household: 'Health & Household',
};

const FLAGS: { pattern: RegExp; flag: RiskFlag; label: string }[] = [
  { pattern: /\bno[\s-]?gated?\b|\bskip[\s-]?gated?\b|\bnot[\s-]?gated?\b/i, flag: 'GATED', label: 'no gated' },
  { pattern: /\bno[\s-]?hazmat\b|\bskip[\s-]?hazmat\b/i, flag: 'HAZMAT', label: 'no hazmat' },
  { pattern: /\bno[\s-]?ip\b|\bno ip[\s-]?risk\b|\bskip[\s-]?ip\b/i, flag: 'IP_CLAIM', label: 'no IP risk' },
  { pattern: /\bno[\s-]?meltable\b|\bskip[\s-]?meltable\b/i, flag: 'MELTABLE', label: 'no meltable' },
  { pattern: /\bno[\s-]?fragile\b|\bskip[\s-]?fragile\b/i, flag: 'FRAGILE', label: 'no fragile' },
  { pattern: /\bno[\s-]?oversize\b|\bskip[\s-]?oversize\b/i, flag: 'OVERSIZE', label: 'no oversize' },
];

const STOPWORDS = new Set([
  'a', 'an', 'the', 'for', 'me', 'show', 'find', 'deals', 'deal', 'leads', 'lead', 'please', 'with', 'and', 'in', 'on',
  'that', 'are', 'is', 'was', 'my', 'of', 'to', 'only', 'just', 'some', 'any', 'items', 'picks', 'picks', 'today\'s',
  'new', 'fresh', 'now', 'listing', 'listings', 'high', 'confidence', 'roi', 'profit', 'under', 'over', 'below', 'above',
  'than', 'less', 'more', 'at', 'least', 'between', 'last', 'past', 'hours', 'hour', 'h', 'days', 'day', 'from', 'bsr',
  'brand', 'no', 'skip', 'not', 'best', 'highest', 'biggest', 'cheapest', 'most', 'good', 'today', 'tonight', 'recent',
]);

function pushChip(chips: NlChip[], kind: NlChip['kind'], label: string) {
  if (!chips.some((c) => c.kind === kind && c.label === label)) chips.push({ kind, label });
}

export function parseNlQuery(raw: string, knownRetailers: { id: string; name: string }[] = []): NlParseResult {
  const q = raw.trim();
  const filters: LeadFilters = { ...DEFAULT_FILTERS, requireFresh: true };
  const chips: NlChip[] = [];
  const unmatched: string[] = [];
  let sort = 'ai';
  let minConfidence: ConfidenceBand | null = null;
  let recencyHours: number | null = null;

  if (!q) return { filters, sort, minConfidence, recencyHours, chips, unmatched };

  // ---- categories (may appear multiple times) ----
  const lower = q.toLowerCase();
  const foundCategories = new Set<string>();
  for (const [alias, cat] of Object.entries(CATEGORY_ALIASES)) {
    const re = new RegExp(`\\b${alias}\\b`, 'i');
    if (re.test(lower)) foundCategories.add(cat);
  }
  if (foundCategories.size > 0) {
    filters.categories = CATEGORY_LIST.filter((c) => foundCategories.has(c));
    for (const c of foundCategories) pushChip(chips, 'category', c);
  }

  // ---- price range ----
  const between = q.match(/between\s*\$?\s*(\d+(?:\.\d+)?)\s*(?:and|to|-)\s*\$?\s*(\d+(?:\.\d+)?)/i);
  const under = q.match(/(?:under|below|less than|cheaper than|max(?:imum)?)\s*\$?\s*(\d+(?:\.\d+)?)/i);
  const over = q.match(/(?:over|above|more than|min(?:imum)?)\s*\$?\s*(\d+(?:\.\d+)?)/i);
  const atLeastPrice = q.match(/at least\s*\$?\s*(\d+(?:\.\d+)?)/i);
  if (between) {
    filters.minPrice = parseFloat(between[1]);
    filters.maxPrice = parseFloat(between[2]);
    pushChip(chips, 'price', `$${filters.minPrice}–$${filters.maxPrice}`);
  } else {
    if (under) {
      filters.maxPrice = parseFloat(under[1]);
      pushChip(chips, 'price', `under $${filters.maxPrice}`);
    }
    if (over) {
      filters.minPrice = parseFloat(over[1]);
      pushChip(chips, 'price', `over $${filters.minPrice}`);
    } else if (atLeastPrice && !/\broi\b|\bprofit\b/i.test(q.slice(atLeastPrice.index ?? 0, (atLeastPrice.index ?? 0) + 14))) {
      filters.minPrice = parseFloat(atLeastPrice[1]);
      pushChip(chips, 'price', `over $${filters.minPrice}`);
    }
  }

  // ---- profit ----
  const profit = q.match(/profit(?:s)?\s*(?:over|above|of|at least|≥|>)?\s*\$?\s*(\d+(?:\.\d+)?)\+?/i);
  const profitSuffix = q.match(/\$?\s*(\d+(?:\.\d+)?)\+?\s*(?:dollars?\s*)?profit/i);
  if (profit) {
    filters.minProfit = parseFloat(profit[1]);
    pushChip(chips, 'profit', `profit ≥ $${filters.minProfit}`);
  } else if (profitSuffix) {
    filters.minProfit = parseFloat(profitSuffix[1]);
    pushChip(chips, 'profit', `profit ≥ $${filters.minProfit}`);
  }

  // ---- ROI ----
  const roiMin = q.match(/(?:roi|r\.o\.i\.)\s*(?:over|above|of|at least|≥|>)?\s*(\d+(?:\.\d+)?)\s*%?\+?/i);
  const roiSuffix = q.match(/(\d+(?:\.\d+)?)\s*%?\+?\s*roi/i);
  const roiMax = q.match(/roi\s*(?:under|below|<|less than)\s*(\d+(?:\.\d+)?)\s*%?/i);
  if (roiMin) {
    filters.minRoi = parseFloat(roiMin[1]);
    pushChip(chips, 'roi', `ROI ≥ ${filters.minRoi}%`);
  } else if (roiSuffix) {
    filters.minRoi = parseFloat(roiSuffix[1]);
    pushChip(chips, 'roi', `ROI ≥ ${filters.minRoi}%`);
  }
  if (roiMax) {
    filters.maxRoi = parseFloat(roiMax[1]);
    pushChip(chips, 'roi', `ROI ≤ ${filters.maxRoi}%`);
  }

  // ---- confidence ----
  if (/\bhigh[\s-]?(?:confidence|conv|certainty)\b/i.test(q)) {
    minConfidence = 'HIGH';
    pushChip(chips, 'confidence', 'high confidence');
  } else if (/\bmedium[\s-]?(?:confidence|conv)\b/i.test(q)) {
    minConfidence = 'MEDIUM';
    pushChip(chips, 'confidence', 'medium confidence');
  }

  // ---- recency ----
  const hours = q.match(/(?:last|past|within)\s+(\d+)\s*(?:h|hr|hrs|hour|hours)\b/i);
  const days = q.match(/(?:last|past|within)\s+(\d+)\s*(?:d|day|days)\b/i);
  if (hours) {
    recencyHours = parseInt(hours[1], 10);
  } else if (days) {
    recencyHours = parseInt(days[1], 10) * 24;
  } else if (/\b(?:today|tonight|this morning|this afternoon)\b/i.test(q)) {
    recencyHours = 24;
  } else if (/\b(?:new|just in|recent)\b/i.test(q)) {
    recencyHours = 24;
  }
  if (recencyHours != null) {
    pushChip(chips, 'recency', recencyHours >= 24 ? `last ${Math.round(recencyHours / 24)}d` : `last ${recencyHours}h`);
  }

  // ---- BSR ----
  const bsr = q.match(/bsr\s*(?:under|below|<|less than)?\s*([\d,]{2,})/i);
  if (bsr) {
    filters.maxBsr = parseInt(bsr[1].replace(/,/g, ''), 10);
    pushChip(chips, 'bsr', `BSR ≤ ${filters.maxBsr.toLocaleString('en-US')}`);
  }

  // ---- risk-flag exclusions ----
  for (const f of FLAGS) {
    if (f.pattern.test(q)) {
      if (!filters.excludeFlags.includes(f.flag)) filters.excludeFlags.push(f.flag);
      pushChip(chips, 'flag', f.label);
    }
  }
  if (/\bno amazon\b|\bno amazon retail\b|\bwithout amazon\b/i.test(q)) {
    filters.amazonOnListing = 'exclude';
    pushChip(chips, 'flag', 'no Amazon Retail');
  }

  // ---- retailer (match against known network) ----
  const retailerMatch = q.match(/(?:from|at)\s+([A-Za-z][A-Za-z'&.\- ]{2,30}?)(?=\s+(?:under|over|below|above|with|no|and|last|high|brand|bsr|profit|roi)\b|\s*$)/i);
  if (retailerMatch) {
    const candidate = retailerMatch[1].trim().toLowerCase();
    const hit = knownRetailers.find((r) => r.name.toLowerCase() === candidate || r.name.toLowerCase().startsWith(candidate));
    if (hit) {
      filters.retailers = [hit.id];
      pushChip(chips, 'retailer', hit.name);
    }
  }

  // ---- brand ----
  const brand = q.match(/brand\s+["']?([A-Za-z0-9][A-Za-z0-9 '&.\-]{1,28}?)["']?(?=\s+(?:under|over|below|above|with|no|and|last|from|bsr|profit|roi|high|$))/i);
  if (brand) {
    filters.search = brand[1].trim();
    pushChip(chips, 'brand', `brand: ${filters.search}`);
  }

  // ---- sort ----
  if (/\b(highest|most|best)\s+profit\b/i.test(q)) sort = 'profit_desc';
  else if (/\b(best|highest)\s+roi\b/i.test(q)) sort = 'roi_desc';
  else if (/\bnewest\b/i.test(q)) sort = 'newest';
  else if (/\b(biggest|best|highest)\s+discount\b/i.test(q)) sort = 'discount_desc';
  else if (/\bcheapest\b/i.test(q)) sort = 'price_asc';
  if (sort !== 'ai') pushChip(chips, 'sort', sort.replace('_', ' '));

  // ---- leftover tokens → honest unmatched + optional text search ----
  const consumed = lower
    .replace(/[^a-z0-9$%.\- ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const meaningful = consumed.filter((t) => !STOPWORDS.has(t) && !/^\$?\d/.test(t) && !CATEGORY_ALIASES[t]);
  // if nothing else parsed at all, treat remaining text as a keyword search
  const parsedSomething = chips.length > 0;
  if (!parsedSomething && meaningful.length > 0) {
    filters.search = meaningful.slice(0, 4).join(' ').slice(0, 60);
    pushChip(chips, 'search', `“${filters.search}”`);
  } else {
    for (const t of meaningful) {
      if (!unmatched.includes(t)) unmatched.push(t);
    }
  }

  return { filters, sort, minConfidence, recencyHours, chips, unmatched };
}

/** Merge a refinement into the previous parse so context is never lost (US-5 AC). */
export function mergeNl(base: NlParseResult, next: NlParseResult): NlParseResult {
  const filters: LeadFilters = {
    ...base.filters,
    ...next.filters,
    categories: Array.from(new Set([...base.filters.categories, ...next.filters.categories])),
    retailers: next.filters.retailers.length > 0 ? next.filters.retailers : base.filters.retailers,
    excludeFlags: Array.from(new Set([...base.filters.excludeFlags, ...next.filters.excludeFlags])),
    search: next.filters.search || base.filters.search,
  };
  return {
    filters,
    sort: next.sort !== 'ai' ? next.sort : base.sort,
    minConfidence: next.minConfidence ?? base.minConfidence,
    recencyHours: next.recencyHours ?? base.recencyHours,
    chips: [...base.chips, ...next.chips.filter((c) => !base.chips.some((b) => b.kind === c.kind && b.label === c.label))],
    unmatched: next.unmatched,
  };
}

/** Confidence floor as a numeric threshold for post-ranking filtering. */
export function confidenceFloor(band: ConfidenceBand | null): number {
  if (band === 'HIGH') return 0.7;
  if (band === 'MEDIUM') return 0.5;
  return 0;
}
