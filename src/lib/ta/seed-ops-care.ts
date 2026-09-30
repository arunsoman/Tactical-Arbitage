// Seed — Ops & Platform Administration fleet + Customer Care tickets.
// Called at the end of seedDatabase() so it can reference real lead ids.

import { db } from '@/lib/db';
import { simulateLlmTest, simulateConnectorTest, computeHealth } from './ops';
import type { TestKind } from './ops';

const HOURS = 3600 * 1000;
const MIN = 60 * 1000;

export async function seedOpsAndCare() {
  const now = Date.now();

  // ── Module A: LLM providers & models ──────────────────────────────────────
  await db.llmTestRun.deleteMany();
  await db.llmModel.deleteMany();
  await db.llmProvider.deleteMany();

  const providers = [
    { name: 'OpenAI', kind: 'openai', keyMasked: 'sk-…f9d2', notes: 'Primary ranking vendor.', agoH: 41 * 24 },
    { name: 'Anthropic', kind: 'anthropic', keyMasked: 'sk-ant-…88c1', notes: 'Reasoning quality upside; monitoring cost.', agoH: 38 * 24 },
    { name: 'Google', kind: 'google', keyMasked: 'AIza…7b30', notes: 'Cheap fallback for NL parsing.', agoH: 30 * 24 },
  ];
  const providerRows = [] as { id: string; name: string; kind: string }[];
  for (const p of providers) {
    const row = await db.llmProvider.create({
      data: { name: p.name, kind: p.kind, keyMasked: p.keyMasked, notes: p.notes, createdAt: new Date(now - p.agoH * HOURS) },
    });
    providerRows.push({ id: row.id, name: row.name, kind: row.kind });
  }
  const [openai, anthropic, google] = providerRows;

  const modelSpecs = [
    { providerId: openai.id, modelId: 'gpt-4o-mini', label: 'GPT-4o mini', contextK: 128, costIn: 0.15, costOut: 0.6, capabilities: ['RANK', 'NL', 'SHOP'], tier: 'PRIMARY', enabled: true, agoD: 40 },
    { providerId: openai.id, modelId: 'gpt-4o', label: 'GPT-4o', contextK: 128, costIn: 2.5, costOut: 10, capabilities: ['REASON', 'EVAL'], tier: 'PRIMARY', enabled: true, agoD: 40 },
    { providerId: anthropic.id, modelId: 'claude-3-5-haiku', label: 'Claude 3.5 Haiku', contextK: 200, costIn: 0.8, costOut: 4, capabilities: ['RANK'], tier: 'FALLBACK', enabled: true, agoD: 21 },
    { providerId: anthropic.id, modelId: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', contextK: 200, costIn: 3, costOut: 15, capabilities: ['REASON', 'SHOP'], tier: 'FALLBACK', enabled: true, agoD: 21 },
    { providerId: google.id, modelId: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', contextK: 1000, costIn: 0.075, costOut: 0.3, capabilities: ['NL'], tier: 'FALLBACK', enabled: false, agoD: 12 },
  ] as const;

  for (const m of modelSpecs) {
    const createdAt = new Date(now - m.agoD * 24 * HOURS);
    const row = await db.llmModel.create({
      data: {
        providerId: m.providerId, modelId: m.modelId, label: m.label, contextK: m.contextK,
        costIn: m.costIn, costOut: m.costOut, capabilities: JSON.stringify(m.capabilities),
        tier: m.tier, enabled: m.enabled, createdAt,
      },
    });
    // historical test runs: 3 per model; the disabled Gemini has a stale FAIL to exercise badges
    for (let i = 3; i >= 1; i--) {
      const sim = simulateLlmTest(row, providerRows.find((p) => p.id === m.providerId)!.kind);
      const staleFail = !m.enabled && i === 1;
      const ok = staleFail ? false : sim.ok;
      const run = await db.llmTestRun.create({
        data: {
          modelId: row.id, ok, latencyMs: sim.latencyMs, promptTokens: sim.promptTokens, outputTokens: sim.outputTokens,
          costEst: sim.costEst, samplePrompt: sim.samplePrompt, sampleOutput: ok ? sim.sampleOutput : null,
          error: ok ? null : sim.error, actor: 'Admin', createdAt: new Date(now - (i === 1 ? 9 * 24 : i * 2) * HOURS),
        },
      });
      if (i === 1) {
        await db.llmModel.update({
          where: { id: row.id },
          data: { lastTestAt: run.createdAt, lastTestStatus: ok ? 'PASS' : 'FAIL', lastLatencyMs: ok ? sim.latencyMs : null },
        });
      }
    }
  }

  // ── Module B: connectors across the lifecycle ─────────────────────────────
  await db.connectorTestRun.deleteMany();
  await db.connector.deleteMany();

  const byDomain = async (domain: string) => (await db.retailer.findUnique({ where: { domain } }))?.id ?? null;
  const connectorSpecs: {
    name: string; domain?: string; adapterType: string; endpoint: string; authType: string;
    rateLimitRpm: number; cadenceHours: number; tier: string; status: string; notes: string;
    runKinds: TestKind[]; failAt?: TestKind; agoH: number;
  }[] = [
    { name: 'Walmart.com', domain: 'walmart.com', adapterType: 'API', endpoint: 'affil.walmartapis.com/v3', authType: 'API_KEY', rateLimitRpm: 120, cadenceHours: 4, tier: 'A', status: 'LIVE', notes: 'Flagship API connector; canary graduate.', runKinds: ['CONNECTIVITY', 'SCHEMA', 'SAMPLE_CRAWL', 'MATCH_PROBE', 'FEE_CONFIG'], agoH: 96 },
    { name: 'Best Buy', domain: 'bestbuy.com', adapterType: 'API', endpoint: 'api.bestbuy.com/beta', authType: 'API_KEY', rateLimitRpm: 90, cadenceHours: 6, tier: 'A', status: 'LIVE', notes: 'Electronics coverage anchor.', runKinds: ['CONNECTIVITY', 'SCHEMA', 'SAMPLE_CRAWL', 'MATCH_PROBE', 'FEE_CONFIG'], agoH: 84 },
    { name: 'Chewy', domain: 'chewy.com', adapterType: 'CRAWLER', endpoint: 'chewy.com/sitemap-pet.xml', authType: 'COOKIES', rateLimitRpm: 45, cadenceHours: 12, tier: 'B', status: 'CANARY', notes: 'Canary since yesterday — watch MATCH_PROBE.', runKinds: ['CONNECTIVITY', 'SCHEMA', 'SAMPLE_CRAWL', 'MATCH_PROBE', 'FEE_CONFIG'], agoH: 40 },
    { name: 'Newegg', domain: 'newegg.com', adapterType: 'CRAWLER', endpoint: 'newegg.com/dealpages', authType: 'NONE', rateLimitRpm: 30, cadenceHours: 24, tier: 'B', status: 'TESTING', notes: 'Mid-suite: schema passed, crawl pending.', runKinds: ['CONNECTIVITY', 'SCHEMA'], agoH: 20 },
    { name: "Boscov's", domain: 'boscovs.com', adapterType: 'CRAWLER', endpoint: 'boscovs.com/category', authType: 'NONE', rateLimitRpm: 20, cadenceHours: 48, tier: 'C', status: 'TESTING', notes: 'Flaky adapter — SAMPLE_CRAWL keeps failing at ~60%.', runKinds: ['CONNECTIVITY', 'SCHEMA', 'SAMPLE_CRAWL'], failAt: 'SAMPLE_CRAWL', agoH: 12 },
    { name: 'Costco Wholesale', domain: 'costco.com', adapterType: 'CRAWLER', endpoint: 'costco.com/grocery', authType: 'COOKIES', rateLimitRpm: 24, cadenceHours: 24, tier: 'A', status: 'DRAFT', notes: 'Membership-wall adapter scoped; not yet testable.', runKinds: [], agoH: 6 },
  ];

  for (const spec of connectorSpecs) {
    const retailerId = spec.domain ? await byDomain(spec.domain) : null;
    const c = await db.connector.create({
      data: {
        name: spec.name, retailerId, adapterType: spec.adapterType, endpoint: spec.endpoint,
        authType: spec.authType, authMasked: spec.authType === 'API_KEY' ? '***' + spec.name.slice(0, 2).toUpperCase() : null,
        rateLimitRpm: spec.rateLimitRpm, cadenceHours: spec.cadenceHours, tier: spec.tier,
        status: spec.status, notes: spec.notes, createdAt: new Date(now - spec.agoH * HOURS),
      },
    });
    let cumulative = [...spec.runKinds];
    for (let i = 0; i < cumulative.length; i++) {
      const kind = cumulative[i];
      const fail = spec.failAt === kind;
      const sim = simulateConnectorTest(c, kind);
      const ok = fail ? false : sim.ok;
      const score = fail ? Math.max(20, sim.score - 35) : sim.score;
      const run = await db.connectorTestRun.create({
        data: {
          connectorId: c.id, kind, ok, score,
          itemsOk: fail ? Math.floor(sim.itemsOk * 0.6) : sim.itemsOk, itemsTotal: sim.itemsTotal,
          errorRate: fail ? 0.4 : sim.errorRate, durationMs: sim.durationMs,
          detailsJson: JSON.stringify({ checks: sim.details.map((d) => (d.pass || !fail ? d : { ...d, pass: false, note: d.note })) }),
          error: ok ? null : sim.error, actor: 'Ops Engineer', createdAt: new Date(now - (spec.agoH - i * 2) * HOURS),
        },
      });
      if (kind === 'SCHEMA' && ok) await db.connector.update({ where: { id: c.id }, data: { schemaOk: true } });
      if (i === cumulative.length - 1 || fail) {
        const runs = await db.connectorTestRun.findMany({ where: { connectorId: c.id } });
        const health = computeHealth(runs.map((r) => ({ kind: r.kind, ok: r.ok, score: r.score, createdAt: r.createdAt })));
        await db.connector.update({ where: { id: c.id }, data: { healthScore: health } });
        void run;
      }
    }
  }

  // ── Admin audit history for the seeded ops actions ────────────────────────
  const auditSeed = [
    { actor: 'Admin', actorRole: 'SYSTEM', action: 'OPS_CONNECTOR_LIVE', targetType: 'connector', targetId: 'Walmart.com', detail: 'Promoted LIVE after canary health 96.2; retailer cadence set to 4h.', agoH: 90 },
    { actor: 'Admin', actorRole: 'SYSTEM', action: 'OPS_CONNECTOR_LIVE', targetType: 'connector', targetId: 'Best Buy', detail: 'Promoted LIVE after canary health 91.4.', agoH: 80 },
    { actor: 'Ops Engineer', actorRole: 'SYSTEM', action: 'OPS_TEST', targetType: 'connector', targetId: "Boscov's", detail: 'SAMPLE_CRAWL failed (error rate 40%) — promotion to CANARY blocked.', agoH: 12 },
    { actor: 'Admin', actorRole: 'SYSTEM', action: 'OPS_MODEL_DISABLE', targetType: 'llm_model', targetId: 'gemini-1.5-flash', detail: 'Disabled after failed probe (503 model_overloaded).', agoH: 9 },
  ];
  for (const a of auditSeed) {
    await db.auditEvent.create({
      data: { actor: a.actor, actorRole: a.actorRole, action: a.action, targetType: a.targetType, targetId: a.targetId, detailJson: JSON.stringify({ detail: a.detail }), createdAt: new Date(now - a.agoH * HOURS) },
    });
  }

  // ── Customer Care: canned responses + tickets ─────────────────────────────
  await db.ticketEvent.deleteMany();
  await db.ticketMessage.deleteMany();
  await db.supportTicket.deleteMany();
  await db.cannedResponse.deleteMany();

  const canned = [
    { title: 'Bad match — confirm & fix', body: 'You are right — we re-checked the match on {ASIN} and it is a bad pairing. We have flagged it for removal and it will disappear from your results within the hour. Any pipeline entry referencing it is safe; economics for other deals are unaffected.' },
    { title: 'Fee estimate correction', body: 'Thanks for catching this. We re-ran the fee breakdown for {ASIN} with your sourcing state: the referral tier was resolved incorrectly for that category. The corrected numbers are {NEW_NUMBERS} and the listing is re-scored.' },
    { title: 'Billing double charge', body: 'I see the duplicate authorization from {DATE} — that is on us. I have refunded the second charge; it lands back on your statement in 3-5 business days, and I have emailed the receipt. Your plan access was never interrupted.' },
    { title: 'Retailer staleness acknowledgement', body: 'The {RETAILER} adapter has been returning partial pages since {DATE}. It is paused from the scan rotation while we fix it, so its deals are marked stale rather than shown as fresh. We will notify you the moment it is back.' },
    { title: 'Feature request thanks', body: 'Great suggestion — I have added it to the product board with your use case attached. We triage these weekly, and I will follow up here when it moves into planning.' },
  ];
  for (const c of canned) await db.cannedResponse.create({ data: c });

  // pick real leads for entity-attached tickets
  const leadForQuality = await db.lead.findFirst({
    where: { pipeline: { is: null }, roiPct: { gte: 25 } },
    orderBy: { score: 'desc' },
  });
  const leadForAi = await db.lead.findFirst({
    where: { pipeline: { is: null }, fresh: true },
    orderBy: { score: 'asc' },
  });
  const staleRetailer = await db.retailer.findFirst({ where: { domain: 'boscovs.com' } });

  const tickets: {
    ref: string; subject: string; category: string; priority: string; status: string;
    leadId?: string; retailerId?: string; assignee?: string; agoH: number;
    frt?: boolean; resolved?: boolean; closed?: boolean; csat?: number; waiting?: boolean;
    customer: string; msgs: { role: 'CUSTOMER' | 'AGENT' | 'SYSTEM'; body: string; internal?: boolean; agoH: number }[];
    events: { type: string; detail: string; actor: string; agoH: number }[];
  }[] = [
    {
      ref: 'TKT-1007', subject: 'Charged twice for the PRO plan upgrade', category: 'BILLING', priority: 'P1', status: 'OPEN', agoH: 2, customer: 'Scaling Sofia',
      msgs: [
        { role: 'CUSTOMER', body: 'I upgraded to PRO this morning and my card shows two charges of $79 — one from your checkout and one pending authorization. Please refund the duplicate.', agoH: 2 },
        { role: 'SYSTEM', body: 'Auto-triage: severity keywords detected — priority escalated to P1.', agoH: 2 },
        { role: 'AGENT', body: 'Hi Sofia — I can see both authorizations on the billing log. The second one is a duplicate capture on our side; I am refunding it now and will confirm here with the receipt within the hour.', agoH: 1 },
      ],
      events: [
        { type: 'CREATED', detail: 'Ticket created from Settings → Help & Support', actor: 'Scaling Sofia', agoH: 2 },
        { type: 'TRIAGE', detail: 'Priority escalated to P1 (severity keywords)', actor: 'System', agoH: 2 },
        { type: 'ASSIGN', detail: 'Assigned to Dana (Care)', actor: 'Dana (Care)', agoH: 1.8 },
        { type: 'REPLY', detail: 'First public reply', actor: 'Dana (Care)', agoH: 1 },
      ],
    },
    {
      ref: 'TKT-1006', subject: 'Wrong product matched — this is a 2-pack, my price is per unit', category: 'DATA_QUALITY', priority: 'P2', status: 'OPEN', leadId: leadForQuality?.id, agoH: 5, customer: 'Scaling Sofia',
      msgs: [
        { role: 'CUSTOMER', body: `This deal (${leadForQuality?.asin ?? 'the attached ASIN'}) shows a strong ROI but the retailer listing is a 2-pack while the Amazon listing looks like a single unit. The price per unit is half what the system assumed.`, agoH: 5 },
        { role: 'AGENT', body: 'Checking the match now — pack-count mismatch is exactly the kind of thing we want reported. I have the full fee breakdown for this deal open on my side and will confirm within the SLA window.', agoH: 3, internal: false },
        { role: 'AGENT', body: 'Match confidence is 0.97 GTIN-exact but pack counts differ (2 vs 1) — likely a catalog data issue on the retailer feed. If confirmed, flag bad-match and suppress this SKU pair.', agoH: 3, internal: true },
      ],
      events: [
        { type: 'CREATED', detail: 'Ticket created with deal attachment', actor: 'Scaling Sofia', agoH: 5 },
        { type: 'ASSIGN', detail: 'Assigned to Dana (Care)', actor: 'Dana (Care)', agoH: 4.5 },
        { type: 'REPLY', detail: 'First public reply', actor: 'Dana (Care)', agoH: 3 },
      ],
    },
    {
      ref: 'TKT-1005', subject: "Boscov's deals all stale since Monday", category: 'CONNECTOR', priority: 'P2', status: 'IN_PROGRESS', retailerId: staleRetailer?.id, assignee: 'Dana (Care)', agoH: 28, customer: 'Scaling Sofia',
      msgs: [
        { role: 'CUSTOMER', body: "Everything from Boscov's has a stale badge since Monday. Is the connector down?", agoH: 28 },
        { role: 'AGENT', body: "Confirmed — the Boscov's connector is failing its sample crawls (about 40% error rate), so ops paused it from rotation while it is being fixed. Its older deals show the stale badge rather than presenting as fresh, which is the intended safe behavior. I will update you when it is back live.", agoH: 26 },
      ],
      events: [
        { type: 'CREATED', detail: 'Ticket created with retailer attachment', actor: 'Scaling Sofia', agoH: 28 },
        { type: 'ASSIGN', detail: 'Assigned to Dana (Care)', actor: 'Dana (Care)', agoH: 27.5 },
        { type: 'REPLY', detail: 'First public reply', actor: 'Dana (Care)', agoH: 26 },
        { type: 'STATUS', detail: 'OPEN → IN_PROGRESS', actor: 'Dana (Care)', agoH: 26 },
      ],
    },
    {
      ref: 'TKT-1004', subject: 'Why did this pick drop out of my top list?', category: 'AI_QUALITY', priority: 'P3', status: 'WAITING_CUSTOMER', leadId: leadForAi?.id, assignee: 'Dana (Care)', agoH: 20, waiting: true, customer: 'Scaling Sofia',
      msgs: [
        { role: 'CUSTOMER', body: `A deal I was about to buy (${leadForAi?.asin ?? 'the attached ASIN'}) disappeared from AI Picks after the re-rank. Nothing changed on my end. What happened?`, agoH: 20 },
        { role: 'AGENT', body: 'Good question — when a new scan refreshes prices, deals re-rank and some drop below your ROI floor. I have attached the economics before and after for this one; can you confirm you were looking at it in the last day or two so I can pin the exact snapshot?', agoH: 18 },
      ],
      events: [
        { type: 'CREATED', detail: 'Ticket created with deal attachment', actor: 'Scaling Sofia', agoH: 20 },
        { type: 'ASSIGN', detail: 'Assigned to Dana (Care)', actor: 'Dana (Care)', agoH: 19 },
        { type: 'REPLY', detail: 'First public reply', actor: 'Dana (Care)', agoH: 18 },
        { type: 'STATUS', detail: 'IN_PROGRESS → WAITING_CUSTOMER', actor: 'Dana (Care)', agoH: 18 },
      ],
    },
    {
      ref: 'TKT-1003', subject: 'Refund processed — thank you', category: 'BILLING', priority: 'P2', status: 'RESOLVED', agoH: 5 * 24, resolved: true, csat: 5, customer: 'Scaling Sofia',
      msgs: [
        { role: 'CUSTOMER', body: 'I was billed after cancelling during the trial.', agoH: 5 * 24 },
        { role: 'AGENT', body: 'Refunded in full — the authorization reversal takes 3-5 business days. Trial cancellations are always honored, sorry for the hiccup.', agoH: 5 * 24 - 3 },
        { role: 'CUSTOMER', body: 'Confirmed, money is back. Thanks for the quick turnaround!', agoH: 4 * 24 },
      ],
      events: [
        { type: 'CREATED', detail: 'Ticket created', actor: 'Scaling Sofia', agoH: 5 * 24 },
        { type: 'REPLY', detail: 'First public reply', actor: 'Dana (Care)', agoH: 5 * 24 - 3 },
        { type: 'RESOLVE', detail: 'Marked resolved', actor: 'Dana (Care)', agoH: 4 * 24 + 2 },
        { type: 'CSAT', detail: 'Customer rated 5/5', actor: 'Scaling Sofia', agoH: 4 * 24 },
      ],
    },
    {
      ref: 'TKT-1002', subject: 'Add a dark mode schedule', category: 'FEATURE', priority: 'P3', status: 'CLOSED', agoH: 9 * 24, closed: true, resolved: true, csat: 4, customer: 'Scaling Sofia',
      msgs: [
        { role: 'CUSTOMER', body: 'Dark mode is great, but can it follow sunset automatically?', agoH: 9 * 24 },
        { role: 'AGENT', body: 'Logged on the product board with your use case — closing this for now, we will announce broadly when it ships.', agoH: 9 * 24 - 5 },
      ],
      events: [
        { type: 'CREATED', detail: 'Ticket created', actor: 'Scaling Sofia', agoH: 9 * 24 },
        { type: 'REPLY', detail: 'First public reply', actor: 'Dana (Care)', agoH: 9 * 24 - 5 },
        { type: 'RESOLVE', detail: 'Marked resolved', actor: 'Dana (Care)', agoH: 8 * 24 },
        { type: 'STATUS', detail: 'RESOLVED → CLOSED (reopen window elapsed)', actor: 'System', agoH: 8 * 24 - 168 / 24 + 1 },
      ],
    },
    {
      ref: 'TKT-1001', subject: 'How do I exclude a brand permanently?', category: 'ACCOUNT', priority: 'P3', status: 'OPEN', agoH: 1, customer: 'Scaling Sofia',
      msgs: [
        { role: 'CUSTOMER', body: 'I see exclusions in settings but is that the same as the AI suppression list? I never want to see this one brand again.', agoH: 1 },
      ],
      events: [{ type: 'CREATED', detail: 'Ticket created from Settings → Help & Support', actor: 'Scaling Sofia', agoH: 1 }],
    },
  ];

  for (const t of tickets) {
    const created = new Date(now - t.agoH * HOURS);
    const firstAgent = t.msgs.find((m) => m.role === 'AGENT' && !m.internal);
    const ticket = await db.supportTicket.create({
      data: {
        ref: t.ref, customerName: t.customer, subject: t.subject, category: t.category,
        priority: t.priority, status: t.status, leadId: t.leadId ?? null, retailerId: t.retailerId ?? null,
        assignee: t.assignee ?? null,
        firstResponseAt: firstAgent ? new Date(now - (firstAgent.agoH) * HOURS) : null,
        resolvedAt: t.resolved ? new Date(now - (t.agoH - 24) * HOURS) : null,
        csat: t.csat ?? null,
        slaBreach: false,
        createdAt: created,
        updatedAt: new Date(now - Math.min(...t.msgs.map((m) => m.agoH)) * HOURS),
      },
    });
    for (const m of t.msgs) {
      await db.ticketMessage.create({
        data: { ticketId: ticket.id, author: m.role === 'CUSTOMER' ? t.customer : m.role === 'AGENT' ? 'Dana (Care)' : 'System', authorRole: m.role, internal: !!m.internal, body: m.body, createdAt: new Date(now - m.agoH * HOURS) },
      });
    }
    for (const e of t.events) {
      await db.ticketEvent.create({
        data: { ticketId: ticket.id, type: e.type, detail: e.detail, actor: e.actor, createdAt: new Date(now - e.agoH * HOURS) },
      });
    }
  }

  return { providers: providerRows.length, models: modelSpecs.length, connectors: connectorSpecs.length, tickets: tickets.length };
}
