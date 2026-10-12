'use client';

// Opportunity verdict panel (investor-demo AI feature set #3): Buy Now / Wait /
// Avoid with dual-sided reasons and a fair-price meter — deterministic ledger
// over the lead's own stored data (verdicts never depend on an LLM, §7.2).

import { CheckCircle2, Timer, Ban, ArrowRight, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtMoney } from '@/lib/ta/profit';
import type { OpportunityVerdict, VerdictLabel } from '@/lib/ta/ai/verdict';

const VERDICT_META: Record<VerdictLabel, { label: string; style: string; ring: string }> = {
  BUY_NOW: {
    label: 'BUY NOW',
    style: 'bg-emerald-600 text-white',
    ring: 'var(--color-emerald-500)',
  },
  WAIT: {
    label: 'WAIT',
    style: 'bg-amber-500 text-slate-950',
    ring: 'var(--color-amber-500)',
  },
  AVOID: {
    label: 'AVOID',
    style: 'bg-red-600 text-white',
    ring: 'var(--color-red-500)',
  },
};

export function VerdictPill({ verdict, confidence, className }: { verdict: VerdictLabel; confidence: number; className?: string }) {
  const meta = VERDICT_META[verdict];
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide', meta.style, className)}
      title={`AI verdict: ${meta.label} — ${confidence}% confidence (deterministic ledger)`}
    >
      {meta.label} · {confidence}%
    </span>
  );
}

export function OpportunityVerdictPanel({ verdict, className }: { verdict: OpportunityVerdict; className?: string }) {
  const meta = VERDICT_META[verdict.verdict];
  const deg = Math.round(verdict.confidence * 3.6);

  return (
    <section className={cn('space-y-3 rounded-xl border border-border bg-card p-3', className)}>
      {/* hero row: verdict + confidence */}
      <div className="flex items-center gap-3">
        <div
          className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(${meta.ring} ${deg}deg, var(--secondary) ${deg}deg)` }}
          role="img"
          aria-label={`${meta.label} verdict at ${verdict.confidence}% confidence`}
        >
          <div className="flex h-11 w-11 flex-col items-center justify-center rounded-full bg-card">
            <span className="text-[13px] font-bold leading-none">{verdict.confidence}%</span>
            <span className="text-[8px] font-medium uppercase leading-none text-muted-foreground">confidence</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Opportunity verdict</p>
          <p className={cn('mt-0.5 text-xl font-black leading-none tracking-wide', verdict.verdict === 'BUY_NOW' ? 'text-emerald-600 dark:text-emerald-400' : verdict.verdict === 'WAIT' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>
            {meta.label}
          </p>
        </div>
        <Scale className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>

      {/* fair-price meter — current sell price vs its own 90-day range */}
      <div className="rounded-lg border border-border bg-muted/30 p-2.5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Fair-price meter — 90-day range</span>
          <span className="font-semibold text-foreground">
            {fmtMoney(verdict.priceLow90)} – {fmtMoney(verdict.priceHigh90)}
          </span>
        </div>
        <div className="relative mt-2 h-2.5 rounded-full bg-gradient-to-r from-emerald-500/60 via-amber-500/60 to-red-500/60">
          <div
            className="absolute top-1/2 h-4 w-1.5 -translate-y-1/2 rounded-full bg-foreground shadow"
            style={{ left: `calc(${Math.max(2, Math.min(98, verdict.fairPercentile))}% - 3px)` }}
            aria-hidden
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>cheap · good entry</span>
          <span className="font-semibold text-foreground">current sell price: {verdict.fairPercentile}th percentile</span>
          <span>near ceiling</span>
        </div>
      </div>

      {/* dual-sided reasons — both ledgers always populated */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Why buy
          </p>
          <ul className="space-y-1.5">
            {verdict.buyReasons.slice(0, 3).map((r, i) => (
              <li key={i} className="text-[12px] leading-snug text-muted-foreground">• {r}</li>
            ))}
          </ul>
        </div>
        <div className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            <Timer className="h-3.5 w-3.5" /> Why wait
          </p>
          <ul className="space-y-1.5">
            {verdict.waitReasons.slice(0, 3).map((r, i) => (
              <li key={i} className="text-[12px] leading-snug text-muted-foreground">• {r}</li>
            ))}
          </ul>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-[10px] leading-snug text-muted-foreground">
        <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
        Deterministic ledger over the stored 90-day series — every claim above cites the exact numbers behind it; the verdict never depends on a language model.
        {verdict.verdict === 'AVOID' && <Ban className="h-3 w-3 shrink-0 text-red-500" aria-hidden />}
      </p>
    </section>
  );
}