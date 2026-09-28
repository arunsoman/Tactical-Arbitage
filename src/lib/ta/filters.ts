// Filter → Prisma query builder for the denormalized deal store (PRD §9 hot path)
// plus CSV export serialization (FR-8.1).

import type { Prisma } from '@prisma/client';
import { sanitizeFilters, parseJsonArray, type LeadFilters } from './types';
import type { Settings } from '@prisma/client';

export interface LeadQuery {
  filters: LeadFilters;
  sort: string;
  page: number;
  pageSize: number;
}

export function parseLeadQuery(searchParams: URLSearchParams): LeadQuery {
  let filters = {};
  try {
    filters = searchParams.get('filters') ? JSON.parse(searchParams.get('filters')!) : {};
  } catch {
    filters = {};
  }
  return {
    filters: sanitizeFilters(filters),
    sort: searchParams.get('sort') ?? 'score',
    page: Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1),
    pageSize: Math.min(100, Math.max(10, parseInt(searchParams.get('pageSize') ?? '25', 10) || 25)),
  };
}

export const SORTS: Record<string, Prisma.LeadOrderByWithRelationInput[]> = {
  score: [{ score: 'desc' }],
  roi_desc: [{ roiPct: 'desc' }],
  roi_asc: [{ roiPct: 'asc' }],
  profit_desc: [{ netProfit: 'desc' }],
  profit_asc: [{ netProfit: 'asc' }],
  price_asc: [{ retailerPrice: 'asc' }],
  price_desc: [{ retailerPrice: 'desc' }],
  bsr_asc: [{ bsr: 'asc' }],
  discount_desc: [{ discountPct: 'desc' }],
  newest: [{ firstSeenAt: 'desc' }],
};

export function buildLeadWhere(f: LeadFilters, settings: Settings): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [];

  if (f.categories.length > 0) and.push({ category: { in: f.categories } });
  if (f.retailers.length > 0) and.push({ retailerId: { in: f.retailers } });

  if (f.minPrice != null || f.maxPrice != null) {
    and.push({
      retailerPrice: {
        ...(f.minPrice != null ? { gte: f.minPrice } : {}),
        ...(f.maxPrice != null ? { lte: f.maxPrice } : {}),
      },
    });
  }
  if (f.minProfit != null) and.push({ netProfit: { gte: f.minProfit } });
  if (f.minRoi != null || f.maxRoi != null) {
    and.push({
      roiPct: {
        ...(f.minRoi != null ? { gte: f.minRoi } : {}),
        ...(f.maxRoi != null ? { lte: f.maxRoi } : {}),
      },
    });
  }
  if (f.minBsr != null || f.maxBsr != null) {
    and.push({
      bsr: {
        ...(f.minBsr != null ? { gte: f.minBsr } : {}),
        ...(f.maxBsr != null ? { lte: f.maxBsr } : {}),
      },
    });
  }
  if (f.minFbaOffers != null || f.maxFbaOffers != null) {
    and.push({
      fbaOffers: {
        ...(f.minFbaOffers != null ? { gte: f.minFbaOffers } : {}),
        ...(f.maxFbaOffers != null ? { lte: f.maxFbaOffers } : {}),
      },
    });
  }
  if (f.amazonOnListing === 'exclude') and.push({ amazonRetail: false });
  if (f.amazonOnListing === 'only') and.push({ amazonRetail: true });
  if (f.minDiscount != null) and.push({ discountPct: { gte: f.minDiscount } });
  if (f.requireFresh) and.push({ fresh: true });

  if (settings.excludeAmazonRetail) and.push({ amazonRetail: false });
  const excludedAsins = parseJsonArray(settings.excludedAsins);
  if (excludedAsins.length > 0) and.push({ asin: { notIn: excludedAsins } });
  const excludedBrands = parseJsonArray(settings.excludedBrands);
  if (excludedBrands.length > 0) and.push({ brand: { notIn: excludedBrands } });

  if (f.search) {
    const q = f.search;
    and.push({
      OR: [{ title: { contains: q } }, { brand: { contains: q } }, { asin: { contains: q } }, { retailerName: { contains: q } }],
    });
  }

  // risk-flag exclusions are stored as JSON strings; filter in-memory post-query is too
  // slow for large sets, so we keep excludeFlags to a post-filter in the route (documented
  // trade-off for the SQLite demo store; prod uses Elasticsearch/ClickHouse per PRD §9).
  return and.length > 0 ? { AND: and } : {};
}

export function postFilterRiskFlags<T extends { riskFlags: string }>(rows: T[], excludeFlags: string[]): T[] {
  if (excludeFlags.length === 0) return rows;
  return rows.filter((r) => {
    const flags = parseJsonArray(r.riskFlags);
    return !excludeFlags.some((f) => flags.includes(f));
  });
}

export const CSV_COLUMNS = [
  'asin',
  'title',
  'brand',
  'category',
  'retailerName',
  'retailerPrice',
  'listPrice',
  'couponPct',
  'retailerShipping',
  'buyBox',
  'referralFee',
  'fbaFee',
  'storageFee',
  'inboundFee',
  'prepFee',
  'taxFee',
  'totalCost',
  'netProfit',
  'roiPct',
  'marginPct',
  'breakeven',
  'discountPct',
  'bsr',
  'fbaOffers',
  'fbmOffers',
  'sizeTier',
  'riskFlags',
  'score',
  'priceAgeH',
  'firstSeenAt',
] as const;

export function leadsToCsv(rows: Record<string, unknown>[]): string {
  const esc = (v: unknown): string => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = CSV_COLUMNS.join(',');
  const lines = rows.map((r) => CSV_COLUMNS.map((c) => esc(r[c])).join(','));
  return [header, ...lines].join('\n');
}
