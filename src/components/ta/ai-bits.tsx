'use client';

// AI-first v2.2 — shared presentational bits: confidence badges, freshness/stale
// indicators, account-health dot, evidence factor rows (progressive disclosure).

import { cn } from '@/lib/utils';
import type { AccountHealthDTO, CalibratedConfidence, ReasonFactor } from '@/lib/ta/ai/types';
import { AlertTriangle, CheckCircle2, Clock, Database, Flame, HeartPulse, ShieldAlert, Sparkles, TrendingUp } from 'lucide-react';

export function ConfidenceBadge({ confidence, className }: { confidence: CalibratedConfidence; className?: string }) {
  const styles: Record<string, string> = {
    HIGH: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    MEDIUM: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
    LOW: 'bg-slate-500/10 text-slate-500 border-slate-500/25',
  };
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', styles[confidence.band], className)}
      title={`${Math.round(confidence.p * 100)}% predicted win rate · calibrated from ${confidence.sampleSize} logged outcomes (${confidence.method === 'global-prior' ? 'global prior — cold start' : 'outcome-calibrated'})`}
    >
      <Sparkles className="h-3 w-3" />
      {confidence.band} {Math.round(confidence.p * 100)}%
    </span>
  );
}

export function FreshnessDot({ ageH, fresh }: { ageH: number; fresh: boolean }) {
  const color = !fresh ? 'bg-red-500' : ageH < 2 ? 'bg-emerald-500' : ageH < 12 ? 'bg-amber-500' : 'bg-orange-500';
  const label = ageH < 1 ? 'verified <1h ago' : `verified ${Math.round(ageH)}h ago${fresh ? '' : ' — STALE'}`;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title={label}>
      <span className={cn('h-1.5 w-1.5 rounded-full', color)} />
      {ageH < 1 ? '<1h' : `${Math.round(ageH)}h`}
    </span>
  );
}

export function StaleBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400', className)}>
      <Clock className="h-3 w-3" /> Data may be stale
    </span>
  );
}

export function HealthDot({ health, showLabel = false }: { health: AccountHealthDTO; showLabel?: boolean }) {
  const color =
    health.label === 'HEALTHY' ? 'text-emerald-500' : health.label === 'WATCH' ? 'text-amber-500' : 'text-red-500';
  return (
    <span className="inline-flex items-center gap-1.5" title={`Account health ${health.score}/100 (${health.label})`}>
      <HeartPulse className={cn('h-4 w-4', color)} />
      {showLabel && (
        <span className={cn('text-xs font-semibold', color)}>
          {health.score} · {health.label.replace('_', ' ')}
        </span>
      )}
    </span>
  );
}

const FACTOR_ICONS: Record<ReasonFactor['key'], typeof TrendingUp> = {
  profit: TrendingUp,
  roi: Flame,
  demand: Database,
  discount: TrendingUp,
  stability: CheckCircle2,
  risk: ShieldAlert,
  personalization: Sparkles,
  freshness: Clock,
};

export function FactorRow({ factor }: { factor: ReasonFactor }) {
  const Icon = FACTOR_ICONS[factor.key] ?? TrendingUp;
  const negative = factor.weight < 0;
  return (
    <div className={cn('flex gap-3 rounded-xl border border-border bg-card p-3', negative && 'border-amber-500/30 bg-amber-500/5')}>
      <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', negative ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400')}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug">{factor.label}</p>
        <p className="mt-0.5 break-words text-xs leading-snug text-muted-foreground">{factor.evidence}</p>
      </div>
    </div>
  );
}

export function AiScoreRing({ score, className }: { score: number; className?: string }) {
  // simple deterministic ring: conic-gradient on the aiScore
  const deg = Math.round(Math.max(0, Math.min(100, score)) * 3.6);
  return (
    <div
      className={cn('relative flex h-12 w-12 items-center justify-center rounded-full', className)}
      style={{ background: `conic-gradient(var(--color-emerald-500) ${deg}deg, var(--secondary) ${deg}deg)` }}
      title={`AI score ${score}/100`}
      role="img"
      aria-label={`AI score ${score} out of 100`}
    >
      <div className="flex h-9 w-9 flex-col items-center justify-center rounded-full bg-card">
        <span className="text-[13px] font-bold leading-none">{Math.round(score)}</span>
        <span className="text-[8px] font-medium uppercase leading-none text-muted-foreground">AI</span>
      </div>
    </div>
  );
}

export function SafeModeBanner({ coldStart, safeMode, personalization, outcomeCount }: { coldStart: boolean; safeMode: boolean; personalization: string; outcomeCount: number }) {
  if (!coldStart && !safeMode) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
      <p className="text-xs leading-snug text-muted-foreground">
        <span className="font-semibold text-foreground">Safe mode is on.</span>{' '}
        {coldStart
          ? 'Global priors while you complete onboarding — picks are conservative until you log outcomes.'
          : `Learning from ${outcomeCount} logged outcomes — personalization is ${personalization === 'WEAK' ? 'warming up (weak)' : 'active (strong)'}. Confidence calibrates to your observed win rates.`}
      </p>
    </div>
  );
}

export function HealthBanner({ health }: { health: AccountHealthDTO }) {
  if (health.score >= 70) return null;
  return (
    <div className={cn('rounded-xl border p-3', health.score < 40 ? 'border-red-500/40 bg-red-500/10' : 'border-amber-500/40 bg-amber-500/10')}>
      <div className="flex items-center gap-2">
        <ShieldAlert className={cn('h-4 w-4', health.score < 40 ? 'text-red-500' : 'text-amber-500')} />
        <p className={cn('text-sm font-semibold', health.score < 40 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')}>
          Account health {health.score}/100 — ranking is health-first
        </p>
      </div>
      <ul className="mt-2 space-y-1">
        {health.reasons.slice(0, 2).map((r, i) => (
          <li key={i} className="text-xs leading-snug text-muted-foreground">• {r}</li>
        ))}
      </ul>
    </div>
  );
}
