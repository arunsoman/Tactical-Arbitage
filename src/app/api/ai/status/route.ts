// AI status (§3 Performance / §5 Online Evaluation / learning health) — powers the
// in-app "AI Status" panel: latency p95 vs PRD budgets, eval metrics, drift, cost.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { p95For } from '@/lib/ta/ai/instrument';
import { evalFromMetric, latestEval, runEvaluation } from '@/lib/ta/ai/eval';
import { personalizationStrength } from '@/lib/ta/ai/health';
import type { AiStatusDTO } from '@/lib/ta/ai/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [rank, reason, nl] = await Promise.all([p95For('RANK'), p95For('REASON'), p95For('NL')]);

    let metric = await latestEval();
    if (!metric) {
      await runEvaluation();
      metric = await latestEval();
    }
    const evalDto = evalFromMetric(metric);

    // Learning health: % of purchases with a logged outcome (target ≥ 80% per §3).
    const purchasedPipeline = await db.pipelineItem.findMany({
      where: { status: { in: ['PURCHASED', 'SHIPPED', 'LIVE', 'WON', 'LOST'] } },
      select: { leadId: true },
    });
    const purchasedLeadIds = purchasedPipeline.map((p) => p.leadId);
    const outcomeLeadIds = purchasedLeadIds.length
      ? (await db.outcome.findMany({ where: { leadId: { in: purchasedLeadIds } }, select: { leadId: true } })).map((o) => o.leadId)
      : [];
    const covered = new Set(outcomeLeadIds).size;
    const totalOutcomes = await db.outcome.count();
    const imputedCount = await db.outcome.count({ where: { imputed: true } });

    const dto: AiStatusDTO = {
      latency: {
        rankP95Ms: rank.p95,
        reasonP95Ms: reason.p95,
        nlP95Ms: nl.p95,
        samples: rank.samples,
        budgetRankMs: 2000,
        budgetReasonMs: 5000,
      },
      eval: {
        ndcg10: evalDto?.ndcg10 ?? 0,
        precision10: evalDto?.precision10 ?? 0,
        winRateAi: evalDto?.winRateAi ?? 0,
        winRateNonAi: evalDto?.winRateNonAi ?? 0,
        roiLiftPct: evalDto?.roiLiftPct ?? 0,
        sampleSize: evalDto?.sampleSize ?? 0,
        drift: evalDto?.drift ?? false,
        computedAt: evalDto?.computedAt.toISOString() ?? null,
      },
      learning: {
        outcomeCoveragePct: purchasedLeadIds.length > 0 ? Math.round((covered / purchasedLeadIds.length) * 100) : 100,
        totalOutcomes,
        imputedShare: totalOutcomes > 0 ? Math.round((imputedCount / totalOutcomes) * 100) : 0,
        personalizationStrength: personalizationStrength(totalOutcomes),
      },
      cost: {
        perRecommendationUsd: 0.0009,
        modelTier: 'Tier-1 deterministic heuristics + Tier-2 calibration (no LLM in ranking path)',
      },
    };
    return NextResponse.json(dto);
  } catch (err) {
    console.error('ai status failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'ai status failed' }, { status: 500 });
  }
}

// Manual re-evaluation (the AI Status view exposes a "Recompute" action).
export async function POST() {
  try {
    await runEvaluation();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('eval failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'eval failed' }, { status: 500 });
  }
}
