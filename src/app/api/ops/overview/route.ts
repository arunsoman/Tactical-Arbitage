// Ops overview (PRD TA-PRD-OPS-1.0 §7): one-screen production health.
// Aggregates system KPIs, connector SLA board, LLM fleet summary, recent
// operational activity, and the admin audit trail.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveRouting } from '@/lib/ta/ops';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [providers, models, connectors, totalLeads, freshLeads, recentJobs, latency, audit, openCareTickets] = await Promise.all([
    db.llmProvider.findMany({ orderBy: { createdAt: 'asc' } }),
    db.llmModel.findMany({ include: { provider: true }, orderBy: { createdAt: 'asc' } }),
    db.connector.findMany({ include: { retailer: { select: { name: true } } }, orderBy: { createdAt: 'asc' } }),
    db.lead.count(),
    db.lead.count({ where: { fresh: true } }),
    db.scanJob.findMany({ where: { startedAt: { gte: weekAgo } }, select: { status: true } }),
    db.latencySample.findMany({ where: { createdAt: { gte: dayAgo } }, orderBy: { createdAt: 'desc' }, take: 400 }),
    db.auditEvent.findMany({ where: { actorRole: 'SYSTEM' }, orderBy: { createdAt: 'desc' }, take: 30 }),
    db.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER'] } } }),
  ]);

  const connectorRuns = await db.connectorTestRun.findMany({ orderBy: { createdAt: 'desc' }, take: 120 });
  const llmRuns = await db.llmTestRun.findMany({ orderBy: { createdAt: 'desc' }, take: 60 });

  // rank/reason p95 vs budgets (2s / 5s, PRD v2.2 §3)
  const p95 = (rows: { ms: number }[]) => {
    if (!rows.length) return null;
    const sorted = [...rows].map((r) => r.ms).sort((a, b) => a - b);
    return Math.round(sorted[Math.floor(sorted.length * 0.95)]);
  };
  const rankP95 = p95(latency.filter((l) => l.op === 'RANK'));
  const reasonP95 = p95(latency.filter((l) => l.op === 'REASON'));
  const nlP95 = p95(latency.filter((l) => l.op === 'NL'));

  const jobsOk = recentJobs.filter((j) => j.status === 'DONE').length;
  const scanSuccessRate = recentJobs.length ? Math.round((jobsOk / recentJobs.length) * 100) : null;

  const enabledModels = models.filter((m) => m.enabled);
  const staleTestModels = enabledModels.filter(
    (m) => !m.lastTestAt || m.lastTestStatus !== 'PASS' || Date.now() - m.lastTestAt.getTime() > 7 * 24 * 3600 * 1000,
  );

  const routing = resolveRouting(
    providers,
    models.map((m) => ({ id: m.id, providerId: m.providerId, capabilities: m.capabilities, tier: m.tier, enabled: m.enabled, modelId: m.modelId })),
  );

  const spendByModel = new Map<string, number>();
  for (const r of llmRuns) {
    spendByModel.set(r.modelId, (spendByModel.get(r.modelId) ?? 0) + r.costEst);
  }

  return NextResponse.json({
    system: {
      totalLeads,
      freshPct: totalLeads ? Math.round((freshLeads / totalLeads) * 100) : 0,
      scanSuccessRate,
      scanJobs7d: recentJobs.length,
      rankP95, reasonP95, nlP95,
      openCareTickets,
    },
    llm: {
      providers: providers.map((p) => ({ id: p.id, name: p.name, kind: p.kind, status: p.status, keyMasked: p.keyMasked, notes: p.notes, modelCount: models.filter((m) => m.providerId === p.id).length })),
      enabledCount: enabledModels.length,
      totalCount: models.length,
      staleTestModels: staleTestModels.map((m) => m.label),
      routing,
      spendByModel: Array.from(spendByModel.entries()).map(([modelId, spend]) => ({
        modelId,
        label: models.find((m) => m.id === modelId)?.label ?? modelId,
        spend: Math.round(spend * 1000) / 1000,
      })),
    },
    connectors: {
      byStatus: connectors.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {}),
      slaBoard: connectors
        .map((c) => ({
          id: c.id, name: c.name, status: c.status, healthScore: c.healthScore,
          cadenceHours: c.cadenceHours, tier: c.tier, retailerName: c.retailer?.name ?? null,
        }))
        .sort((a, b) => {
          const rank: Record<string, number> = { LIVE: 0, CANARY: 1, TESTING: 2, DRAFT: 3, PAUSED: 4, RETIRED: 5 };
          return (rank[a.status] ?? 6) - (rank[b.status] ?? 6) || a.healthScore - b.healthScore;
        }),
    },
    recentActivity: [
      ...connectorRuns.slice(0, 12).map((r) => ({
        id: r.id, kind: 'CONNECTOR_TEST', label: `${r.kind} on ${connectors.find((c) => c.id === r.connectorId)?.name ?? 'connector'}`,
        ok: r.ok, detail: `score ${Math.round(r.score)} · ${Math.round(r.durationMs)}ms`, actor: r.actor, createdAt: r.createdAt,
      })),
      ...llmRuns.slice(0, 8).map((r) => ({
        id: r.id, kind: 'LLM_TEST', label: `Probe on ${models.find((m) => m.id === r.modelId)?.label ?? 'model'}`,
        ok: r.ok, detail: `${Math.round(r.latencyMs)}ms · $${r.costEst.toFixed(4)}`, actor: r.actor, createdAt: r.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 15),
    audit: audit.map((a) => ({ id: a.id, actor: a.actor, action: a.action, targetType: a.targetType, targetId: a.targetId, detail: a.detailJson, createdAt: a.createdAt })),
  });
}
