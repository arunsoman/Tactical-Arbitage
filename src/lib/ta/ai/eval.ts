// Online/offline evaluation (§5 Online Evaluation) + drift alerts with rollback thresholds.
//
// Offline: NDCG@10 and Precision@10 computed over *purchased* leads, where the
// graded relevance comes from realized outcomes (win = realized ROI ≥ half the
// user target and positive net) and the ranking is the AI score.
//
// Online proxy: "AI-influenced" = purchases on leads whose AI score was in the
// top half of the purchased population at evaluation time (documented proxy —
// the demo store does not persist historical rank positions).
//
// Drift: recent-14d win rate vs prior period; a drop > 15 pp triggers a drift
// alert notification (once per drift episode) — the rollback signal (§5).

import { db } from '@/lib/db';
import { round2 } from '../profit';
import type { AiMetric } from '@prisma/client';

export interface EvalResult {
  ndcg10: number;
  precision10: number;
  winRateAi: number;
  winRateNonAi: number;
  roiLiftPct: number;
  sampleSize: number;
  drift: boolean;
  computedAt: Date;
}

interface PurchasedRow {
  leadId: string;
  aiScore: number;
  win: number; // 0/1
  gain: number; // graded relevance 0..1
  roi: number;
  createdAt: Date;
}

function dcg(gains: number[]): number {
  return gains.reduce((acc, g, i) => acc + (Math.pow(2, g) - 1) / Math.log2(i + 2), 0);
}

export async function runEvaluation(): Promise<EvalResult> {
  const outcomes = await db.outcome.findMany({
    where: { type: { in: ['BOUGHT', 'MULTI_UNIT', 'PARTIAL', 'RETURNED'] } },
    orderBy: { createdAt: 'desc' },
    take: 1000,
    include: { lead: { select: { id: true, score: true, roiPct: true } } },
  });

  const settings = await db.settings.findUnique({ where: { id: 'singleton' } });
  const minRoi = (settings?.minRoi ?? 30) / 2 / 100; // win = realized ROI ≥ half target

  const rows: PurchasedRow[] = [];
  for (const o of outcomes) {
    if (!o.lead) continue;
    const win = o.netProfit > 0 && o.roiPct >= minRoi * 100 ? 1 : 0;
    const gain = Math.max(0, Math.min(1, o.roiPct / 100 / 2)); // grade: 50% ROI → 1.0
    rows.push({ leadId: o.leadId, aiScore: o.lead.score, win, gain, roi: o.roiPct, createdAt: o.createdAt });
  }

  const n = rows.length;
  if (n === 0) {
    return { ndcg10: 0, precision10: 0, winRateAi: 0, winRateNonAi: 0, roiLiftPct: 0, sampleSize: 0, drift: false, computedAt: new Date() };
  }

  // NDCG@10 — model order (by AI score) vs ideal order (by realized gain).
  const byModel = [...rows].sort((a, b) => b.aiScore - a.aiScore).slice(0, 10).map((r) => r.gain);
  const ideal = [...rows].sort((a, b) => b.gain - a.gain).slice(0, 10).map((r) => r.gain);
  const ndcg10 = dcg(ideal) > 0 ? round2(dcg(byModel) / dcg(ideal)) : 0;

  // Precision@10 — share of wins inside the model's top 10 (relative to top-10 slots).
  const top10 = [...rows].sort((a, b) => b.aiScore - a.aiScore).slice(0, 10);
  const precision10 = round2(top10.filter((r) => r.win === 1).length / Math.max(1, top10.length));

  // AI-influenced vs rest (top-half AI score proxy).
  const sorted = [...rows].sort((a, b) => b.aiScore - a.aiScore);
  const half = Math.max(1, Math.floor(sorted.length / 2));
  const aiRows = sorted.slice(0, half);
  const nonAiRows = sorted.slice(half);
  const winRateAi = aiRows.length > 0 ? aiRows.filter((r) => r.win === 1).length / aiRows.length : 0;
  const winRateNonAi = nonAiRows.length > 0 ? nonAiRows.filter((r) => r.win === 1).length / nonAiRows.length : 0;
  const avgRoi = (rs: PurchasedRow[]) => (rs.length > 0 ? rs.reduce((a, r) => a + r.roi, 0) / rs.length : 0);
  // ROI lift compares realized ROI of *winning* purchases (§3 target +15–25%):
  // AI-influenced wins are picked from better economics, so realized quality differs.
  const aiWins = aiRows.filter((r) => r.win === 1);
  const nonAiWins = nonAiRows.filter((r) => r.win === 1);
  const roiLiftPct = aiWins.length > 0 && nonAiWins.length > 0 && avgRoi(nonAiWins) > 0
    ? round2(((avgRoi(aiWins) - avgRoi(nonAiWins)) / avgRoi(nonAiWins)) * 100)
    : 0;

  // Drift: recent 14d win rate vs the period before.
  const cutoff = new Date(Date.now() - 14 * 24 * 3600 * 1000);
  const recent = rows.filter((r) => r.createdAt >= cutoff);
  const prior = rows.filter((r) => r.createdAt < cutoff);
  const recentRate = recent.length >= 5 ? recent.filter((r) => r.win === 1).length / recent.length : null;
  const priorRate = prior.length >= 5 ? prior.filter((r) => r.win === 1).length / prior.length : null;
  const drift = recentRate != null && priorRate != null && priorRate - recentRate > 0.15;

  const result: EvalResult = { ndcg10, precision10, winRateAi: round2(winRateAi), winRateNonAi: round2(winRateNonAi), roiLiftPct, sampleSize: n, drift, computedAt: new Date() };

  // Persist snapshot + fire-once drift alert.
  await db.aiMetric.create({
    data: {
      ndcg10: result.ndcg10,
      precision10: result.precision10,
      winRateAi: result.winRateAi,
      winRateNonAi: result.winRateNonAi,
      roiLiftPct: result.roiLiftPct,
      sampleSize: n,
      drift,
    },
  });
  if (drift) {
    const existing = await db.notification.findFirst({ where: { kind: 'DRIFT_ALERT' }, orderBy: { createdAt: 'desc' } });
    const recentAlert = existing && Date.now() - existing.createdAt.getTime() < 7 * 24 * 3600 * 1000;
    if (!recentAlert) {
      await db.notification.create({
        data: {
          kind: 'DRIFT_ALERT',
          title: 'Ranking drift detected',
          body: `Win rate fell from ${Math.round((priorRate ?? 0) * 100)}% to ${Math.round((recentRate ?? 0) * 100)}% in the last 14 days — reviewing ranking weights.`,
          channel: 'push',
        },
      });
    }
  }
  return result;
}

export async function latestEval(): Promise<AiMetric | null> {
  return db.aiMetric.findFirst({ orderBy: { createdAt: 'desc' } });
}

export function evalFromMetric(m: AiMetric | null): EvalResult | null {
  if (!m) return null;
  return {
    ndcg10: m.ndcg10,
    precision10: m.precision10,
    winRateAi: m.winRateAi,
    winRateNonAi: m.winRateNonAi,
    roiLiftPct: m.roiLiftPct,
    sampleSize: m.sampleSize,
    drift: m.drift,
    computedAt: m.createdAt,
  };
}
