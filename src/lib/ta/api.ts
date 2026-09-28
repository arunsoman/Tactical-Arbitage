// Typed API client + shared row types for the TA frontend

import type { LeadFilters, PlanSpec, RiskFlag, ScanSchedule } from './types';

export interface SettingsDTO {
  id: string;
  onboarded: boolean;
  marketplace: string;
  plan: 'STARTER' | 'PRO' | 'EXPERT';
  trialEndsAt: string | null;
  sourcingState: string;
  taxRate: number;
  minRoi: number;
  minProfit: number;
  maxBsr: number;
  minOffers: number;
  excludeAmazonRetail: boolean;
  prepCost: number;
  inboundCost: number;
  monthlyBudget: number;
  excludedBrands: string;
  excludedAsins: string;
}

export interface BootstrapDTO {
  settings: SettingsDTO;
  plan: PlanSpec;
  retailers: { id: string; name: string; domain: string; tier: string; status: string; cadenceHours: number; coverage: number }[];
  categories: string[];
  counts: { totalLeads: number; freshLeads: number; reviewQueue: number; pipelineCount: number; scansets: number };
}

export interface LeadRow {
  id: string;
  asin: string;
  title: string;
  brand: string;
  category: string;
  imageUrl: string;
  retailerId: string;
  retailerName: string;
  retailerTier: string;
  retailerPrice: number;
  listPrice: number;
  couponPct: number;
  buyBox: number;
  netProfit: number;
  roiPct: number;
  marginPct: number;
  breakeven: number;
  discountPct: number;
  bsr: number;
  fbaOffers: number;
  fbmOffers: number;
  sizeTier: string;
  amazonRetail: boolean;
  riskFlags: string;
  score: number;
  priceAgeH: number;
  fresh: boolean;
  firstSeenAt: string;
  pipeline?: { id: string; status: string } | null;
}

export interface LeadsResponse {
  rows: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface LeadDetailDTO {
  lead: LeadRow & { riskFlagList: RiskFlag[]; referralFee: number; fbaFee: number; storageFee: number; inboundFee: number; prepFee: number; taxFee: number; totalCost: number; retailerShipping: number; taxRate: number; lastVerifiedAt: string };
  match: { method: string; confidence: number; status: string; flagged: boolean; flagNote: string | null; packCount: number; unitSize: string; upc: string; sku: string };
  listing: {
    asin: string;
    title: string;
    brand: string;
    category: string;
    buyBox: number;
    bsr: number;
    fbaOffers: number;
    fbmOffers: number;
    amazonRetail: boolean;
    gated: boolean;
    hazmat: boolean;
    meltable: boolean;
    fragile: boolean;
    ipClaim: boolean;
    sizeTier: string;
    weightLb: number;
    lengthIn: number;
    widthIn: number;
    heightIn: number;
    keepa30Avg: number;
    keepa90Avg: number;
    priceStability: number;
    rankTrend: string;
    history: { d: string; p: number; r: number }[];
  };
  retailer: { id: string; name: string; domain: string; tier: string; cadenceHours: number; status: string };
  pipeline: { id: string; status: string; notes: string | null; tags: string; qty: number; owner: string } | null;
}

export interface ScanSetDTO {
  id: string;
  name: string;
  schedule: ScanSchedule;
  active: boolean;
  isDefault: boolean;
  lastRunAt: string | null;
  filters: LeadFilters;
  newSinceRun: number;
  total: number;
}

export interface DashboardDTO {
  kpis: {
    northStar: { value: number; target: number; label: string };
    leadsToday: number;
    leads7d: number;
    totalLeads: number;
    avgRoi: number;
    matchPrecision: number;
    priceFreshness: number;
    scanCoverage: number;
    reviewQueue: number;
    healthySites: number;
    totalSites: number;
  };
  leadsPerDay: { d: string; n: number }[];
  roiBuckets: { bucket: string; n: number }[];
  categories: { category: string; count: number; avgRoi: number; totalProfit: number }[];
  recentJobs: { id: string; retailer: string; tier: string; status: string; skus: number; newLeads: number; errors: number; startedAt: string }[];
  activity: { id: string; type: string; message: string; createdAt: string }[];
  topOpportunities: {
    id: string;
    title: string;
    retailerName: string;
    asin: string;
    category: string;
    retailerPrice: number;
    buyBox: number;
    netProfit: number;
    roiPct: number;
    score: number;
    riskFlags: string;
    imageUrl: string;
  }[];
  plan: string;
}

export interface RetailersDTO {
  retailers: {
    id: string;
    name: string;
    domain: string;
    tier: string;
    status: string;
    cadenceHours: number;
    lastScanAt: string | null;
    coverage: number;
    avgFreshnessH: number;
    notes: string | null;
    slaHours: number;
    productCount: number;
  }[];
  recentJobs: { id: string; retailer: string; status: string; pages: number; skus: number; newLeads: number; priceUpdates: number; errors: number; startedAt: string }[];
}

export interface PipelineItemDTO {
  id: string;
  status: string;
  notes: string | null;
  tags: string;
  qty: number;
  owner: string;
  createdAt: string;
  updatedAt: string;
  lead: {
    id: string;
    asin: string;
    title: string;
    brand: string;
    category: string;
    imageUrl: string;
    retailerName: string;
    retailerPrice: number;
    buyBox: number;
    netProfit: number;
    roiPct: number;
    bsr: number;
    riskFlags: string;
    score: number;
    firstSeenAt: string;
  };
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  bootstrap: () => fetch('/api/bootstrap').then((r) => handle<BootstrapDTO>(r)),

  leads: (filters: LeadFilters, sort: string, page: number, pageSize: number) => {
    const params = new URLSearchParams({ filters: JSON.stringify(filters), sort, page: String(page), pageSize: String(pageSize) });
    return fetch(`/api/leads?${params}`).then((r) => handle<LeadsResponse>(r));
  },

  leadDetail: (id: string) => fetch(`/api/leads/${id}`).then((r) => handle<LeadDetailDTO>(r)),

  dashboard: () => fetch('/api/dashboard').then((r) => handle<DashboardDTO>(r)),

  scanRun: (opts: { scanSetId?: string; retailerIds?: string[]; retailerLimit?: number } = {}) =>
    fetch('/api/scan/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    }).then((r) => handle<{ ok: boolean; summary: { totals: { newLeads: number; priceUpdates: number; jobs: number; errors: number }; jobs: { retailer: string; status: string; newLeads: number }[]; durationMs: number } }>(r)),

  scanSets: () => fetch('/api/scansets').then((r) => handle<{ scans: ScanSetDTO[]; planLimit: number | null }>(r)),

  createScanSet: (body: { name: string; schedule: string; filters: LeadFilters }) =>
    fetch('/api/scansets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => handle<{ ok: boolean }>(r)),

  updateScanSet: (id: string, body: Record<string, unknown>) =>
    fetch(`/api/scansets/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => handle<{ ok: boolean }>(r)),

  deleteScanSet: (id: string) => fetch(`/api/scansets/${id}`, { method: 'DELETE' }).then((r) => handle<{ ok: boolean }>(r)),

  retailers: () => fetch('/api/retailers').then((r) => handle<RetailersDTO>(r)),

  rescanRetailer: (retailerId: string) =>
    fetch('/api/scan/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ retailerIds: [retailerId] }) }).then((r) => handle<{ ok: boolean }>(r)),

  pipeline: () => fetch('/api/pipeline').then((r) => handle<{ items: PipelineItemDTO[] }>(r)),

  saveToPipeline: (leadId: string) =>
    fetch('/api/pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId }) }).then((r) => handle<{ ok: boolean; existed: boolean; item: PipelineItemDTO }>(r)),

  updatePipeline: (id: string, body: Record<string, unknown>) =>
    fetch(`/api/pipeline/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => handle<{ ok: boolean }>(r)),

  deletePipeline: (id: string) => fetch(`/api/pipeline/${id}`, { method: 'DELETE' }).then((r) => handle<{ ok: boolean }>(r)),

  flagMatch: (leadId: string, note: string) =>
    fetch('/api/match/flag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId, note }) }).then((r) => handle<{ ok: boolean }>(r)),

  updateSettings: (body: Record<string, unknown>) =>
    fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => handle<{ ok: boolean }>(r)),

  changePlan: (plan: string, cycle: string) =>
    fetch('/api/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, cycle }) }).then((r) => handle<{ ok: boolean }>(r)),

  seed: () => fetch('/api/seed', { method: 'POST' }).then((r) => handle<{ ok: boolean }>(r)),
};
