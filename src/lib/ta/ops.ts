// Ops & Platform Administration engine (PRD TA-PRD-OPS-1.0).
// LLM capability routing, deterministic test simulation, connector suite,
// promotion gates, and health scoring. In this sandbox, external LLM calls
// and retailer crawls are simulated; contracts match the production shape.

import type { Prisma, } from '@prisma/client';
import type { LlmModel, LlmProvider, Connector, ConnectorTestRun } from '@prisma/client';

export type Capability = 'RANK' | 'REASON' | 'NL' | 'EVAL' | 'SHOP';
export const CAPABILITIES: Capability[] = ['RANK', 'REASON', 'NL', 'EVAL', 'SHOP'];

export type TestKind = 'CONNECTIVITY' | 'SCHEMA' | 'SAMPLE_CRAWL' | 'MATCH_PROBE' | 'FEE_CONFIG';
export const TEST_KINDS: TestKind[] = ['CONNECTIVITY', 'SCHEMA', 'SAMPLE_CRAWL', 'MATCH_PROBE', 'FEE_CONFIG'];

export const TEST_LABELS: Record<TestKind, string> = {
  CONNECTIVITY: 'Connectivity & auth',
  SCHEMA: 'Payload schema',
  SAMPLE_CRAWL: 'Sample crawl (25 SKUs)',
  MATCH_PROBE: 'Match probe',
  FEE_CONFIG: 'Fee config alignment',
};

export const LIFECYCLE: Connector['status'][] = ['DRAFT', 'TESTING', 'CANARY', 'LIVE', 'PAUSED', 'RETIRED'];

// ── deterministic PRNG so demo results are stable per entity ──
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── capability routing (FR-A4): enabled models from ACTIVE providers,
//    PRIMARY tier first, then creation order. ──
export function resolveRouting(
  providers: Pick<LlmProvider, 'id' | 'status'>[],
  models: Pick<LlmModel, 'id' | 'providerId' | 'modelId' | 'capabilities' | 'tier' | 'enabled'>[],
): Record<Capability, { modelId: string; label: string }[]> {
  const active = new Set(providers.filter((p) => p.status === 'ACTIVE').map((p) => p.id));
  const enabled = models.filter((m) => m.enabled && active.has(m.providerId));
  const order = { PRIMARY: 0, FALLBACK: 1 } as const;
  const sorted = [...enabled].sort((a, b) => order[a.tier as 'PRIMARY' | 'FALLBACK'] - order[b.tier as 'PRIMARY' | 'FALLBACK']);
  const out = { RANK: [], REASON: [], NL: [], EVAL: [], SHOP: [] } as Record<Capability, { modelId: string; label: string }[]>;
  for (const m of sorted) {
    let caps: string[] = [];
    try { caps = JSON.parse(m.capabilities); } catch { /* ignore */ }
    for (const c of caps) {
      if (c in out) out[c as Capability].push({ modelId: m.id, label: m.modelId });
    }
  }
  return out;
}

// ── LLM probe simulation (FR-A5): capability-appropriate prompts, stable per model ──
const PROBES: Record<Capability, string> = {
  RANK: 'Score two candidate deals 0-100 given price, BSR, and fee inputs. Return JSON {scores:[..]}.',
  REASON: 'Write a one-line evidence-linked reason for a pick given its factor list.',
  NL: 'Parse: "new electronics under $35 high confidence last 8 hours" into filter JSON.',
  EVAL: 'Compute NDCG@10 for the provided graded ranking pairs.',
  SHOP: 'Write a 2-sentence shopper-facing narrative for a buy-or-wait verdict from the supplied factor ledger.',
};

export interface SimulatedLlmRun {
  ok: boolean;
  latencyMs: number;
  promptTokens: number;
  outputTokens: number;
  costEst: number;
  samplePrompt: string;
  sampleOutput: string;
  error?: string;
}

export function simulateLlmTest(model: Pick<LlmModel, 'modelId' | 'capabilities' | 'costIn' | 'costOut' | 'contextK'>, providerKind: string): SimulatedLlmRun {
  const rnd = mulberry32(hashSeed(`${model.modelId}:probe:${providerKind}`));
  let caps: string[] = [];
  try { caps = JSON.parse(model.capabilities); } catch { /* ignore */ }
  const cap: Capability = (caps[0] as Capability) ?? 'RANK';
  const baseLatency = providerKind === 'google' ? 420 : providerKind === 'anthropic' ? 560 : 380;
  const latencyMs = Math.round(baseLatency + rnd() * 900);
  const promptTokens = 180 + Math.floor(rnd() * 220);
  const outputTokens = 90 + Math.floor(rnd() * 160);
  const costEst = (promptTokens / 1e6) * model.costIn + (outputTokens / 1e6) * model.costOut;
  const ok = rnd() > 0.08; // realistic ~92% first-try pass
  return {
    ok,
    latencyMs,
    promptTokens,
    outputTokens,
    costEst: Math.round(costEst * 100000) / 100000,
    samplePrompt: PROBES[cap],
    sampleOutput: ok
      ? cap === 'RANK'
        ? '{"scores":[72.4, 18.9]} — both candidates scored, ranking stable.'
        : cap === 'NL'
          ? '{"category":"Electronics","maxPrice":35,"minConfidence":"HIGH","recencyHours":8} — 4 filters parsed.'
          : cap === 'SHOP'
            ? 'Best total is near its 90-day low at a well-rated seller; waiting risks stock, not savings.'
            : 'Picked for 34% ROI with fresh price (2h old) and stable 90-day trend.'
      : `upstream_error: ${providerKind === 'google' ? '503 model_overloaded' : '429 rate_limited'} after ${latencyMs}ms`,
    error: ok ? undefined : 'Probe failed with upstream provider error (simulated).',
  };
}

// ── connector suite simulation (§6.3): stable per connector + kind ──
export interface SimulatedConnectorRun {
  ok: boolean;
  score: number;
  itemsOk: number;
  itemsTotal: number;
  errorRate: number;
  durationMs: number;
  details: { check: string; pass: boolean; note: string }[];
  error?: string;
}

export function simulateConnectorTest(
  connector: Pick<Connector, 'id' | 'name' | 'adapterType' | 'endpoint' | 'authType' | 'rateLimitRpm'>,
  kind: TestKind,
  attempt = 0,
): SimulatedConnectorRun {
  const rnd = mulberry32(hashSeed(`${connector.id}:${kind}:a${attempt}`));
  const itemsTotal = kind === 'SAMPLE_CRAWL' ? 25 : kind === 'MATCH_PROBE' ? 18 : kind === 'FEE_CONFIG' ? 12 : 1;
  // attempt-aware flake model: a flaky first run can pass on re-run; the degraded
  // adapter (Boscov's) stays flaky at a higher retry rate
  const flakyBase = connector.name.includes('Boscov') ? (attempt === 0 ? 0.55 : 0.7) : attempt === 0 ? 0.96 : 0.995;
  const pass = rnd() < flakyBase;
  const itemsOk = pass ? Math.max(itemsTotal - Math.floor(rnd() * 2), Math.ceil(itemsTotal * 0.9)) : Math.ceil(itemsTotal * (0.5 + rnd() * 0.3));
  const errorRate = Math.round(((itemsTotal - itemsOk) / itemsTotal) * 10000) / 10000;
  const durationMs = Math.round(600 + rnd() * 2400);
  const details: { check: string; pass: boolean; note: string }[] = [];
  const build = (checks: [string, boolean, string][]) => checks.forEach(([c, p, n]) => details.push({ check: c, pass: p, note: n }));

  if (kind === 'CONNECTIVITY') {
    build([
      ['DNS resolve', true, `${connector.endpoint} resolved`],
      ['TLS handshake', true, 'valid chain, expires in 84 days'],
      ['Auth', connector.authType === 'NONE' || pass, connector.authType === 'NONE' ? 'no auth required' : 'API key accepted'],
      ['Response time', pass, `${Math.round(durationMs)}ms < 3000ms budget`],
    ]);
  } else if (kind === 'SCHEMA') {
    build([
      ['Required fields', pass, pass ? 'title/price/gtin present on all items' : '3 items missing gtin'],
      ['Type validation', pass, 'numeric price, ISO timestamps'],
      ['GTIN format', pass || errorRate < 0.2, 'GS1 12-13 digit parse'],
    ]);
  } else if (kind === 'SAMPLE_CRAWL') {
    build([
      ['Robots & rate limit', true, `${connector.rateLimitRpm} rpm respected`],
      ['Items crawled', pass, `${itemsOk}/${itemsTotal} SKUs normalized`],
      ['No crashes', pass, pass ? 'worker clean' : '1 worker timeout at page 4'],
      ['Stock states', pass, 'in_stock / oos labels mapped'],
    ]);
  } else if (kind === 'MATCH_PROBE') {
    build([
      ['GTIN exact rate', pass, `${Math.round((itemsOk / itemsTotal) * 100)}% exact`],
      ['Fuzzy fallback sane', pass, 'no duplicate GTIN collisions'],
      ['Price snapshot sane', pass, 'retailer price < list within tolerance'],
    ]);
  } else {
    build([
      ['Category mapping', pass, pass ? '12/12 categories map to fee table' : '1 unmapped category (Baby Apparel)'],
      ['Surcharge assumptions', pass, 'no retailer-side handling fee detected'],
      ['Fee drift', pass, 'drift < 2% vs fee engine'],
    ]);
  }
  const score = Math.round((itemsOk / itemsTotal) * 100);
  return {
    ok: pass,
    score,
    itemsOk,
    itemsTotal,
    errorRate,
    durationMs,
    details,
    error: pass ? undefined : `${TEST_LABELS[kind]} failed on ${connector.name} (simulated adapter behavior).`,
  };
}

// ── health score (§6.4): recency- and importance-weighted composite ──
const KIND_WEIGHTS: Record<TestKind, number> = {
  CONNECTIVITY: 0.12,
  SCHEMA: 0.13,
  SAMPLE_CRAWL: 0.3,
  MATCH_PROBE: 0.3,
  FEE_CONFIG: 0.15,
};

export function computeHealth(runs: { kind: string; ok: boolean; score: number; createdAt: Date }[]): number {
  const latest = new Map<string, { ok: boolean; score: number; createdAt: Date }>();
  for (const r of runs) {
    const prev = latest.get(r.kind);
    if (!prev || prev.createdAt < r.createdAt) latest.set(r.kind, r);
  }
  let total = 0;
  let weight = 0;
  for (const [kind, r] of latest) {
    const w = KIND_WEIGHTS[kind as TestKind] ?? 0.1;
    total += w * r.score;
    weight += w;
  }
  return weight === 0 ? 0 : Math.round((total / weight) * 10) / 10;
}

// ── promotion gates (§6.4 / Table 6-3) ──
export interface GateResult { id: string; label: string; pass: boolean; detail: string }

const VALIDITY_MS = 24 * 3600 * 1000;

export function evaluateGates(
  connector: Pick<Connector, 'status' | 'healthScore' | 'schemaOk'>,
  runs: ConnectorTestRun[],
  to: string,
): { ok: boolean; gates: GateResult[] } {
  const now = Date.now();
  const latestBy = new Map<string, ConnectorTestRun>();
  for (const r of runs) {
    const prev = latestBy.get(r.kind);
    if (!prev || prev.createdAt < r.createdAt) latestBy.set(r.kind, r);
  }
  const fresh = (r?: ConnectorTestRun) => !!r && r.ok && now - r.createdAt.getTime() <= VALIDITY_MS;
  const gates: GateResult[] = [];

  if (to === 'TESTING') {
    const c = latestBy.get('CONNECTIVITY');
    gates.push({ id: 'conn', label: 'CONNECTIVITY passed', pass: fresh(c), detail: c ? `last run ${c.ok ? 'passed' : 'failed'} ${ago(c.createdAt, now)}` : 'never run' });
  } else if (to === 'CANARY') {
    for (const k of TEST_KINDS) {
      const r = latestBy.get(k);
      gates.push({ id: k, label: `${TEST_LABELS[k]} passed (24h)`, pass: fresh(r), detail: r ? `last run ${r.ok ? 'passed' : 'failed'} ${ago(r.createdAt, now)}` : 'never run' });
    }
    const sc = latestBy.get('SAMPLE_CRAWL');
    gates.push({ id: 'err', label: 'Sample-crawl error rate < 5%', pass: !!sc && sc.ok && sc.errorRate < 0.05, detail: sc ? `${(sc.errorRate * 100).toFixed(1)}%` : 'no run' });
  } else if (to === 'LIVE') {
    gates.push({ id: 'canary-state', label: 'Currently in CANARY', pass: connector.status === 'CANARY', detail: `status is ${connector.status}` });
    gates.push({ id: 'health', label: 'Canary health \u2265 80', pass: connector.healthScore >= 80, detail: `health ${connector.healthScore.toFixed(1)}` });
    const failures = runs.filter((r) => !r.ok && now - r.createdAt.getTime() <= VALIDITY_MS);
    gates.push({ id: 'no-fail', label: 'No failed suite test in 24h', pass: failures.length === 0, detail: failures.length ? `${failures.length} recent failure(s)` : 'clean' });
  } else if (to === 'PAUSED' || to === 'RETIRED') {
    gates.push({ id: 'manual', label: 'Manual action confirmed', pass: true, detail: to === 'PAUSED' ? 'retailer excluded from next scan cycle' : 'irreversible' });
  }
  return { ok: gates.every((g) => g.pass), gates };
}

function ago(d: Date, now: number): string {
  const h = Math.max(0, (now - d.getTime()) / 3600000);
  return h < 1 ? `${Math.round(h * 60)}m ago` : `${h.toFixed(1)}h ago`;
}

// ── DTOs shared with the client ──
export interface LlmModelDTO {
  id: string;
  modelId: string;
  label: string;
  contextK: number;
  costIn: number;
  costOut: number;
  capabilities: string[];
  tier: string;
  enabled: boolean;
  lastTestAt: string | null;
  lastTestStatus: string | null;
  lastLatencyMs: number | null;
  providerId: string;
  providerName: string;
  providerStatus: string;
  providerKind: string;
}

export interface ConnectorRowDTO {
  id: string;
  name: string;
  adapterType: string;
  endpoint: string;
  authType: string;
  authMasked: string | null;
  rateLimitRpm: number;
  cadenceHours: number;
  tier: string;
  status: string;
  schemaOk: boolean;
  healthScore: number;
  notes: string | null;
  retailerId: string | null;
  retailerName: string | null;
  lastRuns: { kind: string; ok: boolean; score: number; createdAt: string }[];
  gatesForNext: { to: string; ok: boolean }[];
}

export type PrismaConnector = Prisma.ConnectorGetPayload<{ include: { retailer: { select: { name: true } } } }>;
