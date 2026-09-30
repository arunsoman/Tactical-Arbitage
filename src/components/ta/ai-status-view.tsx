'use client';

// AI Status (§3 Performance / §5 Latency & Cost / Online Evaluation): the
// transparency panel — latency p95 vs PRD budgets, eval metrics (NDCG@10,
// Precision@10, AI vs non-AI win rate, ROI lift), drift, learning health, cost.

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/ta/api';
import type { AiStatusDTO } from '@/lib/ta/ai/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Activity, BrainCircuit, CheckCircle2, Coins, Gauge, RefreshCcw, Timer } from 'lucide-react';

export function AiStatusView() {
  const { toast } = useToast();
  const [data, setData] = useState<AiStatusDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.aiStatus());
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recompute = async () => {
    setBusy(true);
    try {
      await api.recomputeEval();
      toast({ title: 'Evaluation recomputed', description: 'NDCG / precision / drift refreshed from logged outcomes.' });
      void load();
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-3 px-3 pb-24 pt-3">
        <Skeleton className="h-8 w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const rankOk = data.latency.rankP95Ms <= data.latency.budgetRankMs;
  const reasonOk = data.latency.reasonP95Ms <= data.latency.budgetReasonMs;
  const e = data.eval;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 px-3 pb-24 pt-3 md:px-4">
      <header className="flex items-center gap-2">
        <div>
          <h1 className="flex items-center gap-1.5 text-lg font-bold leading-tight">
            <BrainCircuit className="h-5 w-5 text-emerald-500" /> AI status
          </h1>
          <p className="text-xs text-muted-foreground">Performance, calibration quality and cost — no black boxes</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto h-11 px-3" onClick={recompute} disabled={busy}>
          <RefreshCcw className={cn('mr-1 h-4 w-4', busy && 'animate-spin')} /> Recompute eval
        </Button>
      </header>

      {/* latency budgets */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
          <Timer className="h-4 w-4 text-emerald-500" /> Latency budgets (§3)
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <BudgetCard label="Ranking p95" value={data.latency.rankP95Ms} budget={data.latency.budgetRankMs} ok={rankOk} />
          <BudgetCard label="Reasoning p95" value={data.latency.reasonP95Ms} budget={data.latency.budgetReasonMs} ok={reasonOk} />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{data.latency.samples} rolling samples · NL parse p95 {data.latency.nlP95Ms}ms</p>
      </section>

      {/* evaluation */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
          <Gauge className="h-4 w-4 text-emerald-500" /> Online evaluation
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="NDCG@10" value={e.ndcg10.toFixed(2)} />
          <Metric label="Precision@10" value={`${Math.round(e.precision10 * 100)}%`} />
          <Metric label="AI win rate" value={`${Math.round(e.winRateAi * 100)}%`} accent="text-emerald-600 dark:text-emerald-400" />
          <Metric label="Non-AI win rate" value={`${Math.round(e.winRateNonAi * 100)}%`} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', e.roiLiftPct >= 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/15 text-red-600 dark:text-red-400')}>
            ROI lift (AI vs non-AI): {e.roiLiftPct >= 0 ? '+' : ''}{e.roiLiftPct}% <span className="font-normal opacity-70">· target +15–25%</span>
          </span>
          {e.drift ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-400">
              <Activity className="h-3.5 w-3.5" /> Drift alert active — rollback review
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" /> No drift
            </span>
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Computed from {e.sampleSize} purchase outcomes{e.computedAt ? ` · ${new Date(e.computedAt).toLocaleString()}` : ''} · AI-influenced = top-half AI score (documented proxy)
        </p>
      </section>

      {/* learning health */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
          <Activity className="h-4 w-4 text-emerald-500" /> Learning health
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <Metric label="Outcome coverage" value={`${data.learning.outcomeCoveragePct}%`} accent={data.learning.outcomeCoveragePct >= 80 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'} />
          <Metric label="Outcomes logged" value={String(data.learning.totalOutcomes)} />
          <Metric label="Imputed share" value={`${data.learning.imputedShare}%`} />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Personalization strength: <span className="font-semibold">{data.learning.personalizationStrength}</span> — gated by outcome volume (20–30 weak, 100+ strong per §5).
        </p>
      </section>

      {/* cost */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Coins className="h-4 w-4 text-emerald-500" /> Cost per recommendation
        </h2>
        <p className="text-2xl font-bold">${data.cost.perRecommendationUsd.toFixed(4)}</p>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{data.cost.modelTier}</p>
      </section>
    </div>
  );
}

function BudgetCard({ label, value, budget, ok }: { label: string; value: number; budget: number; ok: boolean }) {
  const pct = Math.min(100, (value / budget) * 100);
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Activity className="h-4 w-4 text-red-500" />}
      </div>
      <p className="mt-1 text-lg font-bold">
        {value.toFixed(0)}ms <span className="text-xs font-normal text-muted-foreground">/ {budget / 1000}s budget</span>
      </p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className={cn('h-full rounded-full', ok ? 'bg-emerald-500' : 'bg-red-500')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-lg font-bold', accent)}>{value}</p>
    </div>
  );
}
