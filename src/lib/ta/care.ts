// Customer Care Portal engine (PRD TA-PRD-CARE-1.0).
// SLA policy, auto-triage rules, ticket refs, and the Ticket 360 snapshot
// assembler contract. 360 assembly itself runs in the API route with Prisma.

import type { SupportTicket } from '@prisma/client';

export const CATEGORIES = ['BILLING', 'DATA_QUALITY', 'CONNECTOR', 'AI_QUALITY', 'ACCOUNT', 'SHOPPING', 'FEATURE', 'OTHER'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  BILLING: 'Billing & plan',
  DATA_QUALITY: 'Data quality (deal/match/price)',
  CONNECTOR: 'Retailer coverage',
  AI_QUALITY: 'AI picks & reasons',
  ACCOUNT: 'Account & settings',
  SHOPPING: 'BuyWise verdict & deals',
  FEATURE: 'Feature request',
  OTHER: 'Something else',
};

export type Priority = 'P1' | 'P2' | 'P3';
export const SLA_POLICY: Record<Priority, { frtH: number; resH: number }> = {
  P1: { frtH: 1, resH: 8 },
  P2: { frtH: 4, resH: 24 },
  P3: { frtH: 12, resH: 72 },
};

export const DEFAULT_PRIORITY: Record<Category, Priority> = {
  BILLING: 'P2',
  DATA_QUALITY: 'P2',
  CONNECTOR: 'P2',
  AI_QUALITY: 'P3',
  ACCOUNT: 'P3',
  SHOPPING: 'P3',
  FEATURE: 'P3',
  OTHER: 'P3',
};

export const STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'] as const;
export type TicketStatus = (typeof STATUSES)[number];

// allowed transitions (Table 6-2)
const FLOW: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['WAITING_CUSTOMER', 'RESOLVED'],
  WAITING_CUSTOMER: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: ['OPEN'],
};

export function canTransition(from: string, to: string): boolean {
  return (FLOW[from as TicketStatus] ?? []).includes(to as TicketStatus);
}

export function nextTicketRef(latestRef: string | undefined): string {
  const n = latestRef ? parseInt(latestRef.replace('TKT-', ''), 10) : 1000;
  return `TKT-${(isNaN(n) ? 1000 : n) + 1}`;
}

// ── auto-triage (§7.1): deterministic keyword rules, no LLM dependency ──
const ESCALATE = [
  'charged twice', 'double charge', 'refund now', 'locked out', 'cannot log in', 'fraud', 'cancel my account',
  // consumer (BuyWise) severity keywords — TA-PRD-SHOP-1.0 §9.1
  'never arrived', 'damaged', 'wrong item', 'price was wrong', 'price went up', 'overcharged', 'scam',
];
const DE_ESCALATE = ['how do i', 'how to', 'question about', 'where can i find', 'is there a way'];

export function autoTriage(subject: string, body: string, category: Category): { suggestedPriority: Priority; escalate: boolean; note: string } {
  const text = `${subject} ${body}`.toLowerCase();
  const escalate = ESCALATE.some((k) => text.includes(k));
  const soft = DE_ESCALATE.some((k) => text.includes(k));
  let suggestedPriority = DEFAULT_PRIORITY[category];
  let note = `Auto-triage: category ${category}, priority ${suggestedPriority} (category default).`;
  if (escalate && suggestedPriority !== 'P1') {
    suggestedPriority = suggestedPriority === 'P3' ? 'P2' : 'P1';
    note = `Auto-triage: severity keywords detected — priority escalated to ${suggestedPriority}.`;
  } else if (soft && !escalate) {
    note = `Auto-triage: informational phrasing detected — priority held at ${suggestedPriority}.`;
  }
  return { suggestedPriority, escalate, note };
}

// ── SLA state rendering ──
export function slaState(t: Pick<SupportTicket, 'priority' | 'status' | 'createdAt' | 'firstResponseAt' | 'slaBreach'>): {
  label: string; kind: 'ok' | 'warn' | 'breach' | 'done'; pct: number
} {
  const policy = SLA_POLICY[t.priority as Priority] ?? SLA_POLICY.P3;
  const now = Date.now();
  const created = t.createdAt.getTime();
  if (t.status === 'RESOLVED' || t.status === 'CLOSED') {
    return { label: t.status === 'CLOSED' ? 'Closed' : 'Resolved', kind: 'done', pct: 100 };
  }
  // WAITING_CUSTOMER pauses the FRT clock (PRD §6.5)
  const end = t.firstResponseAt
    ? created + policy.resH * 3600 * 1000
    : t.status === 'WAITING_CUSTOMER'
      ? created // paused
      : created + policy.frtH * 3600 * 1000;
  const target = t.firstResponseAt ? policy.resH : policy.frtH;
  const elapsedH = (now - created) / 3600000;
  const pct = Math.min(100, Math.round((elapsedH / target) * 100));
  if (t.firstResponseAt) {
    const remH = (end - now) / 3600000;
    if (remH <= 0) return { label: `Resolution breached (${target}h target)`, kind: 'breach', pct: 100 };
    if (pct >= 75) return { label: `Resolve in ${remH.toFixed(1)}h`, kind: 'warn', pct };
    return { label: `Resolve in ${remH.toFixed(1)}h`, kind: 'ok', pct };
  }
  if (t.status === 'WAITING_CUSTOMER') return { label: 'Waiting on customer', kind: 'ok', pct: 0 };
  const remH = (end - now) / 3600000;
  if (remH <= 0) return { label: `First response breached (${target}h target)`, kind: 'breach', pct: 100 };
  if (pct >= 75) return { label: `Reply in ${remH.toFixed(1)}h`, kind: 'warn', pct };
  return { label: `Reply in ${remH.toFixed(1)}h`, kind: 'ok', pct };
}

// ── 360 snapshot DTO (PRD Table 6-1) ──
export interface Ticket360DTO {
  ticket: {
    id: string; ref: string; subject: string; category: string; priority: string; status: string;
    assignee: string | null; createdAt: string; updatedAt: string; firstResponseAt: string | null;
    resolvedAt: string | null; csat: number | null; slaBreach: boolean;
    leadId: string | null; retailerId: string | null; scanSetId: string | null;
    customerType: string; customerEmail: string | null; consumerSearchId: string | null;
  };
  sla: ReturnType<typeof slaState>;
  customer: {
    name: string;
    plan: string; planPrice: number; billingCycle: string; trialEndsAt: string | null;
    onboarded: boolean; marketplace: string; sourcingState: string;
    health: { score: number; band: string } | null;
  };
  usage: {
    totalLeads: number; freshLeads: number; scansets: number;
    pipeline: { NEW: number; PURCHASED: number; WON: number; LOST: number; other: number };
    outcomesLogged: number; winRate: number | null;
  };
  referenced: {
    kind: 'lead' | 'retailer' | null;
    lead: {
      id: string; asin: string; title: string; brand: string; category: string; imageUrl: string;
      retailerName: string; retailerPrice: number; buyBox: number; netProfit: number; roiPct: number;
      marginPct: number; breakeven: number; totalCost: number; riskFlags: string; priceAgeH: number;
      fresh: boolean; bsr: number; score: number; firstSeenAt: string;
      history: { d: string; p: number }[];
    } | null;
    retailer: { id: string; name: string; domain: string; tier: string; status: string; coverage: number; cadenceHours: number; lastScanAt: string | null } | null;
  };
  pastTickets: { id: string; ref: string; subject: string; status: string; category: string; createdAt: string; csat: number | null }[];
  // BuyWise consumer context (TA-PRD-SHOP-1.0 §9.2) — null for arbitrage tickets
  consumer: {
    email: string;
    shopperSince: string;
    searchCount: number;
    watchCount: number;
    lastVerdict: string | null;
    searches: { id: string; productName: string; verdict: string; confidence: number; bestVendor: string; bestTotal: number; createdAt: string }[];
    referencedSearch: {
      id: string; productName: string; brand: string; category: string;
      verdict: string; confidence: number; narrative: string; engineLabel: string;
      bestVendor: string; bestTotal: number; worstTotal: number; fairPercentile: number;
      priceLow90: number; priceHigh90: number; createdAt: string;
      quotes: { vendor: string; vendorType: string; total: number; price: number; shipping: number; tax: number; inStock: boolean; etaDays: number; rating: number; returnDays: number; badges: string[] }[];
    } | null;
  } | null;
  relatedActivity: { id: string; type: string; message: string; createdAt: string }[];
  messages: { id: string; author: string; authorRole: string; internal: boolean; body: string; createdAt: string }[];
  events: { id: string; type: string; detail: string | null; actor: string; createdAt: string }[];
  canned: { id: string; title: string; body: string }[];
}
