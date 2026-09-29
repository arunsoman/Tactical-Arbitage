// Which saved scans "own" a lead: the scan that discovered it plus every scan whose
// filters it satisfies. Used to show scan provenance wherever a product is displayed.

import type { Settings } from '@prisma/client';
import { db } from '@/lib/db';
import { sanitizeFilters, parseJsonArray, type LeadFilters } from './types';

export interface LeadScanRef {
  id: string;
  name: string;
  /** true when this scan's run discovered the lead */
  found: boolean;
}

export interface ScanIndexEntry {
  id: string;
  name: string;
  filters: LeadFilters;
}

export interface LeadLike {
  category: string;
  retailerId: string;
  retailerPrice: number;
  discountPct: number;
  roiPct: number;
  netProfit: number;
  bsr: number;
  fbaOffers: number;
  riskFlags: string;
  fresh: boolean;
  amazonRetail: boolean;
  foundByScanId?: string | null;
}

export async function loadScanIndex(): Promise<ScanIndexEntry[]> {
  const scans = await db.scanSet.findMany({ orderBy: { createdAt: 'asc' } });
  return scans.map((s) => ({ id: s.id, name: s.name, filters: sanitizeFilters(JSON.parse(s.filtersJson || '{}')) }));
}

const within = (v: number, min: number | null, max: number | null) => (min == null || v >= min) && (max == null || v <= max);

export function matchesFilters(l: LeadLike, f: LeadFilters, settings: Pick<Settings, 'excludeAmazonRetail'>): boolean {
  if (f.categories.length > 0 && !f.categories.includes(l.category)) return false;
  if (f.retailers.length > 0 && !f.retailers.includes(l.retailerId)) return false;
  if (!within(l.retailerPrice, f.minPrice, f.maxPrice)) return false;
  if (f.minProfit != null && l.netProfit < f.minProfit) return false;
  if (!within(l.roiPct, f.minRoi, f.maxRoi)) return false;
  if (!within(l.bsr, f.minBsr, f.maxBsr)) return false;
  if (!within(l.fbaOffers, f.minFbaOffers, f.maxFbaOffers)) return false;
  if (f.minDiscount != null && l.discountPct < f.minDiscount) return false;
  if (f.amazonOnListing === 'exclude' && l.amazonRetail) return false;
  if (f.amazonOnListing === 'only' && !l.amazonRetail) return false;
  if (settings.excludeAmazonRetail && l.amazonRetail) return false;
  if (f.requireFresh && !l.fresh) return false;
  const flags = parseJsonArray(l.riskFlags);
  if (f.excludeFlags.some((x) => flags.includes(x))) return false;
  return true;
}

export function scansForLead(l: LeadLike, index: ScanIndexEntry[], settings: Pick<Settings, 'excludeAmazonRetail'>): LeadScanRef[] {
  const refs: LeadScanRef[] = [];
  for (const s of index) {
    const found = l.foundByScanId === s.id;
    if (found || matchesFilters(l, s.filters, settings)) refs.push({ id: s.id, name: s.name, found });
  }
  return refs.sort((a, b) => Number(b.found) - Number(a.found));
}
