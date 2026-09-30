// Typed API client + shared row types for the TA frontend

import type { LeadFilters, PlanSpec, RiskFlag, ScanSchedule } from './types';
import type { LeadScanRef } from './scanAttribution';

export type { LeadScanRef };
import type { AiStatusDTO, NlChip, PickDTO, AccountHealthDTO } from './ai/types';
import type { Ticket360DTO } from './care';
import type { ShopResultsDTO, ShopSearchSummaryDTO } from './shop';

export type { Ticket360DTO, ShopResultsDTO, ShopSearchSummaryDTO };

// ---------- Ops & Platform Administration DTOs (TA-PRD-OPS-1.0) ----------
export interface OpsOverviewDTO {
  system: { totalLeads: number; freshPct: number; scanSuccessRate: number | null; scanJobs7d: number; rankP95: number | null; reasonP95: number | null; nlP95: number | null; openCareTickets: number };
  llm: {
    providers: { id: string; name: string; kind: string; status: string; keyMasked: string | null; notes: string | null; modelCount: number }[];
    enabledCount: number; totalCount: number; staleTestModels: string[];
    routing: Record<string, { modelId: string; label: string }[]>;
    spendByModel: { modelId: string; label: string; spend: number }[];
  };
  connectors: { byStatus: Record<string, number>; slaBoard: { id: string; name: string; status: string; healthScore: number; cadenceHours: number; tier: string; retailerName: string | null }[] };
  recentActivity: { id: string; kind: string; label: string; ok: boolean; detail: string; actor: string; createdAt: string }[];
  audit: { id: string; actor: string; action: string; targetType: string; targetId: string; detail: string | null; createdAt: string }[];
}

export interface OpsLlmsDTO {
  providers: {
    id: string; name: string; kind: string; baseUrl: string | null; status: string; keyMasked: string | null; notes: string | null; createdAt: string;
    models: { id: string; modelId: string; label: string; contextK: number; costIn: number; costOut: number; capabilities: string[]; tier: string; enabled: boolean; lastTestAt: string | null; lastTestStatus: string | null; lastLatencyMs: number | null }[];
  }[];
  routing: Record<string, { modelId: string; label: string }[]>;
}

export interface OpsConnectorsDTO {
  connectors: {
    id: string; name: string; adapterType: string; endpoint: string; authType: string; authMasked: string | null;
    rateLimitRpm: number; cadenceHours: number; tier: string; status: string; schemaOk: boolean;
    healthScore: number; notes: string | null; retailerId: string | null; retailerName: string | null; createdAt: string;
    lastRuns: { kind: string; ok: boolean; score: number; createdAt: string }[];
  }[];
  retailers: { id: string; name: string; domain: string; tier: string; status: string }[];
  lifecycle: string[];
}

// ---------- Customer Care Portal DTOs (TA-PRD-CARE-1.0) ----------
export interface CareQueueRow {
  id: string; ref: string; subject: string; category: string; priority: string; status: string;
  assignee: string | null; customerName: string; createdAt: string; updatedAt: string;
  customerType: string; customerEmail: string | null;
  firstResponseAt: string | null; resolvedAt: string | null; csat: number | null; slaBreach: boolean;
  hasLead: boolean; hasRetailer: boolean; hasScanSet: boolean; hasSearch: boolean;
  lastMessage: { authorRole: string; internal: boolean; createdAt: string } | null;
  sla: { label: string; kind: 'ok' | 'warn' | 'breach' | 'done'; pct: number };
}

export interface CareQueueDTO {
  tickets: CareQueueRow[];
  counts: { open: number; inProgress: number; waiting: number; resolved: number; closed: number; breached: number };
}

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
  riskTolerance: string;
  preferredCategories: string;
  theme: string;
}

export interface PicksResponseDTO {
  picks: PickDTO[];
  meta: {
    generatedAt: string;
    cached: boolean;
    stale: boolean;
    coldStart: boolean;
    safeMode: boolean;
    personalization: 'NONE' | 'WEAK' | 'STRONG';
    outcomeCount: number;
    health: AccountHealthDTO;
    rankMs: number;
    reasonMs: number;
    excludedStale: number;
    excludedSuppressed: number;
  };
}

export interface NlSearchResponseDTO {
  parse: { chips: NlChip[]; unmatched: string[]; minConfidence: string | null; recencyHours: number | null };
  results: PickDTO[];
  total: number;
  tookMs: number;
  calibratedWith: number;
}

export interface NotificationDTO {
  id: string;
  kind: string;
  title: string;
  body: string;
  leadId: string | null;
  deepLink: string | null;
  channel: string;
  read: boolean;
  createdAt: string;
}

export interface TeamMemberDTO {
  id: string;
  name: string;
  role: 'OWNER' | 'MANAGER' | 'VA';
  email: string | null;
  active: boolean;
  createdAt: string;
}

export interface ApprovalDTO {
  id: string;
  kind: 'BUY' | 'SUPPRESS';
  leadId: string | null;
  payloadJson: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedBy: string;
  decidedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface AuditEventDTO {
  id: string;
  actor: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  detailJson: string | null;
  createdAt: string;
}

export interface SuppressionDTO {
  id: string;
  scope: string;
  value: string;
  reason: string | null;
  actor: string;
  createdAt: string;
}

export interface DisputeDTO {
  id: string;
  leadId: string;
  reason: string;
  status: string;
  actor: string;
  createdAt: string;
}

export interface OutcomeDTO {
  id: string;
  leadId: string;
  type: string;
  units: number;
  unitsSold: number;
  unitsReturned: number;
  revenue: number;
  cost: number;
  netProfit: number;
  roiPct: number;
  win: boolean;
  imputed: boolean;
  note: string | null;
  actor: string;
  actorRole: string;
  createdAt: string;
}

export interface PendingOutcomeDTO {
  id: string;
  status: string;
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
    totalCost: number;
    netProfit: number;
    roiPct: number;
  };
}

export interface BootstrapDTO {
  settings: SettingsDTO;
  plan: PlanSpec;
  retailers: { id: string; name: string; domain: string; tier: string; status: string; cadenceHours: number; coverage: number }[];
  categories: string[];
  counts: { totalLeads: number; freshLeads: number; reviewQueue: number; pipelineCount: number; scansets: number; unreadNotifications: number; pendingApprovals: number; pendingOutcomes: number; openCareTickets: number };
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
  scans?: LeadScanRef[];
}

export interface LeadsResponse {
  rows: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface LeadDetailDTO {
  buyUrl?: string;
  scans?: LeadScanRef[];
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
  lastRunStartedAt: string | null;
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
    scans?: LeadScanRef[];
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
  buyUrl?: string | null;
  unitCost: number | null;
  orderNumber: string | null;
  realizedProfit: number | null;
  expectedProfit: number | null;
  expectedRoi: number | null;
  buyPrice: number | null;
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
    scans?: LeadScanRef[];
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

  leads: (filters: LeadFilters, sort: string, page: number, pageSize: number, since?: string | null) => {
    const params = new URLSearchParams({ filters: JSON.stringify(filters), sort, page: String(page), pageSize: String(pageSize) });
    if (since) params.set('since', since);
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
    fetch('/api/pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId }) }).then((r) => handle<{ ok: boolean; existed: boolean; item: PipelineItemDTO; warnings?: string[] }>(r)),

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

  // ---------- AI-first v2.2 ----------
  picks: (refresh = false) => fetch(`/api/ai/picks${refresh ? '?refresh=1' : ''}`).then((r) => handle<PicksResponseDTO>(r)),

  aiStatus: () => fetch('/api/ai/status').then((r) => handle<AiStatusDTO>(r)),

  recomputeEval: () => fetch('/api/ai/status', { method: 'POST' }).then((r) => handle<{ ok: boolean }>(r)),

  nlSearch: (q: string, prev?: unknown) =>
    fetch('/api/nl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q, prev }) }).then((r) => handle<NlSearchResponseDTO>(r)),

  health: () => fetch('/api/health').then((r) => handle<AccountHealthDTO>(r)),

  pendingOutcomes: () => fetch('/api/outcomes?pending=1').then((r) => handle<{ pending: PendingOutcomeDTO[] }>(r)),

  logOutcome: (body: Record<string, unknown>) =>
    fetch('/api/outcomes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => handle<{ ok: boolean; win: boolean; outcome: OutcomeDTO }>(r)),

  trust: () => fetch('/api/trust').then((r) => handle<{ suppressions: SuppressionDTO[]; disputes: DisputeDTO[] }>(r)),

  trustAction: (body: Record<string, unknown>) =>
    fetch('/api/trust', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => handle<{ ok: boolean; pendingApproval?: boolean }>(r)),

  audit: (action = 'ALL') => fetch(`/api/audit?action=${encodeURIComponent(action)}`).then((r) => handle<{ events: AuditEventDTO[] }>(r)),

  notifications: () => fetch('/api/notifications').then((r) => handle<{ notifications: NotificationDTO[]; unread: number }>(r)),

  markNotifications: (body: { id?: string; all?: boolean }) =>
    fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => handle<{ ok: boolean }>(r)),

  team: () => fetch('/api/team').then((r) => handle<{ members: TeamMemberDTO[]; approvals: ApprovalDTO[] }>(r)),

  addTeamMember: (body: { name: string; role: string; email?: string }) =>
    fetch('/api/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => handle<{ ok: boolean }>(r)),

  updateTeamMember: (body: { id: string; role?: string; active?: boolean }) =>
    fetch('/api/team', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => handle<{ ok: boolean }>(r)),

  decideApproval: (body: { id: string; decision: 'APPROVED' | 'REJECTED'; decidedBy?: string; decidedByRole?: string }) =>
    fetch('/api/approvals', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => handle<{ ok: boolean }>(r)),

  // ---------- Ops & Platform Administration (TA-PRD-OPS-1.0) ----------
  opsOverview: () => fetch('/api/ops/overview').then((r) => handle<OpsOverviewDTO>(r)),

  opsLlms: () => fetch('/api/ops/llms').then((r) => handle<OpsLlmsDTO>(r)),

  createLlmProvider: (body: { name: string; kind: string; baseUrl?: string; apiKey?: string; notes?: string }) =>
    fetch('/api/ops/llms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => handle<{ ok: boolean }>(r)),

  toggleLlmProvider: (id: string, status: 'ACTIVE' | 'DISABLED') =>
    fetch('/api/ops/llms', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) }).then((r) => handle<{ ok: boolean }>(r)),

  enrollLlmModel: (body: { providerId: string; modelId: string; label?: string; contextK?: number; costIn?: number; costOut?: number; capabilities: string[]; tier?: string; enabled?: boolean }) =>
    fetch('/api/ops/llms/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => handle<{ ok: boolean }>(r)),

  updateLlmModel: (body: { id: string; capabilities?: string[]; tier?: string; enabled?: boolean; costIn?: number; costOut?: number }) =>
    fetch('/api/ops/llms/models', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => handle<{ ok: boolean }>(r)),

  testLlmModel: (modelId: string) =>
    fetch('/api/ops/llms/models/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelId }) }).then((r) => handle<{ ok: boolean; message: string; run: { ok: boolean; latencyMs: number; costEst: number; sampleOutput: string | null; error: string | null } }>(r)),

  opsConnectors: () => fetch('/api/ops/connectors').then((r) => handle<OpsConnectorsDTO>(r)),

  createConnector: (body: { name: string; adapterType: string; endpoint: string; authType?: string; authSecret?: string; rateLimitRpm?: number; cadenceHours?: number; tier?: string; retailerId?: string; notes?: string }) =>
    fetch('/api/ops/connectors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => handle<{ ok: boolean }>(r)),

  updateConnector: (body: Record<string, unknown>) =>
    fetch('/api/ops/connectors', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => handle<{ ok: boolean }>(r)),

  testConnector: (connectorId: string, kind: string) =>
    fetch('/api/ops/connectors/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectorId, kind }) }).then((r) => handle<{ ok: boolean; message: string; healthScore: number; run: { ok: boolean; score: number; durationMs: number; details: { check: string; pass: boolean; note: string }[]; error: string | null } }>(r)),

  promoteConnector: (connectorId: string, to: string) =>
    fetch('/api/ops/connectors/promote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectorId, to }) }).then((r) => handle<{ ok: boolean; message: string; gates?: { id: string; label: string; pass: boolean; detail: string }[] }>(r)),

  gatePreview: (connectorId: string, to: string) =>
    fetch(`/api/ops/connectors/promote?connectorId=${encodeURIComponent(connectorId)}&to=${encodeURIComponent(to)}`).then((r) => handle<{ to: string; ok: boolean; gates: { id: string; label: string; pass: boolean; detail: string }[] }>(r)),

  // ---------- Customer Care Portal (TA-PRD-CARE-1.0) ----------
  careTickets: (filters: { status?: string; category?: string; priority?: string; customerType?: string; email?: string; q?: string } = {}) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v && v !== 'ALL') params.set(k, v);
    return fetch(`/api/care/tickets?${params}`).then((r) => handle<CareQueueDTO>(r));
  },

  createTicket: (body: { subject: string; category: string; description: string; priority?: string; leadId?: string; retailerId?: string; customerType?: 'ARBITRAGE' | 'CONSUMER'; customerName?: string; customerEmail?: string; consumerSearchId?: string }) =>
    fetch('/api/care/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => handle<{ ok: boolean; ticket: { id: string; ref: string; priority: string; category: string }; triageNote: string }>(r)),

  ticket360: (id: string) => fetch(`/api/care/tickets/${id}`).then((r) => handle<Ticket360DTO>(r)),

  updateTicket: (id: string, body: Record<string, unknown>) =>
    fetch(`/api/care/tickets/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => handle<{ ok: boolean }>(r)),

  replyTicket: (id: string, body: { body: string; internal?: boolean; role?: 'AGENT' | 'CUSTOMER' }) =>
    fetch(`/api/care/tickets/${id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => handle<{ ok: boolean }>(r)),

  cannedResponses: () => fetch('/api/care/canned').then((r) => handle<{ canned: { id: string; title: string; body: string }[] }>(r)),

  // ---------- BuyWise consumer shopping (TA-PRD-SHOP-1.0) ----------
  shopSearch: (query: string, email?: string) =>
    fetch('/api/shop/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, email }) }).then((r) => handle<ShopResultsDTO>(r)),

  shopSearches: (email?: string) => {
    const q = email ? `?email=${encodeURIComponent(email)}` : '';
    return fetch(`/api/shop/searches${q}`).then((r) => handle<{ searches: ShopSearchSummaryDTO[] }>(r));
  },

  shopResults: (id: string) => fetch(`/api/shop/searches/${id}`).then((r) => handle<ShopResultsDTO>(r)),

  shopWatches: (email: string) =>
    fetch(`/api/shop/watch?email=${encodeURIComponent(email)}`).then((r) => handle<{ watches: { id: string; email: string; targetPrice: number; createdAt: string; search: { id: string; productName: string; bestTotal: number; verdict: string; imageUrl: string; createdAt: string } }[] }>(r)),

  shopWatchCreate: (body: { searchId: string; email: string; targetPrice: number }) =>
    fetch('/api/shop/watch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => handle<{ ok: boolean; watch: { id: string; targetPrice: number } }>(r)),

  shopWatchDelete: (id: string) => fetch(`/api/shop/watch/${id}`, { method: 'DELETE' }).then((r) => handle<{ ok: boolean }>(r)),
};
