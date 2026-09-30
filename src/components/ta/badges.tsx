'use client';

// Shared badge/chip primitives: risk flags, ROI, freshness, match provenance.

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { RISK_FLAG_META, type RiskFlag } from '@/lib/ta/types';
import { parseJsonArray } from '@/lib/ta/types';
import { Clock, ShieldAlert, ScanSearch, Radar } from 'lucide-react';
import type { LeadScanRef } from '@/lib/ta/api';

export function RiskFlagChips({ flags, max = 3, className }: { flags: string | RiskFlag[]; max?: number; className?: string }) {
  const list = Array.isArray(flags) ? flags : parseJsonArray(flags);
  if (list.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const shown = list.slice(0, max);
  const rest = list.length - shown.length;
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {shown.map((f) => {
        const meta = RISK_FLAG_META[f as RiskFlag];
        if (!meta) return null;
        return (
          <Badge
            key={f}
            variant="outline"
            className={cn(
              'px-1.5 py-0 text-[10px] font-medium',
              meta.severity === 'high' && 'border-red-300 bg-red-50 text-red-700',
              meta.severity === 'medium' && 'border-amber-300 bg-amber-50 text-amber-700',
              meta.severity === 'low' && 'border-border bg-secondary text-foreground/80'
            )}
          >
            {meta.label}
          </Badge>
        );
      })}
      {rest > 0 && <span className="text-[10px] text-muted-foreground">+{rest}</span>}
    </div>
  );
}

export function RoiBadge({ roi }: { roi: number }) {
  const tone =
    roi >= 60
      ? 'bg-emerald-600 text-white hover:bg-emerald-600'
      : roi >= 30
        ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
        : roi >= 10
          ? 'bg-amber-100 text-amber-800 hover:bg-amber-100'
          : 'bg-red-100 text-red-700 hover:bg-red-100';
  return (
    <Badge className={cn('font-mono text-xs font-semibold tabular-nums', tone)} variant="secondary">
      {roi >= 0 ? '' : '−'}
      {Math.abs(roi).toFixed(0)}%
    </Badge>
  );
}

export function ProfitText({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('font-mono text-sm font-semibold tabular-nums', value >= 0 ? 'text-emerald-700' : 'text-red-600', className)}>
      {value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}
    </span>
  );
}

export function FreshnessDot({ fresh, ageH, tier }: { fresh: boolean; ageH: number; tier: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs tabular-nums', fresh ? 'text-emerald-700' : 'text-amber-700')}
      title={fresh ? `Price verified ${ageH.toFixed(1)}h ago (within Tier ${tier} SLA)` : `Stale: ${ageH.toFixed(1)}h old, exceeds Tier ${tier} SLA`}
    >
      <span className={cn('inline-block h-2 w-2 rounded-full', fresh ? 'bg-emerald-500' : 'bg-amber-500')} />
      {ageH >= 24 ? `${Math.round(ageH / 24)}d` : `${ageH.toFixed(1)}h`}
    </span>
  );
}

export function MatchBadge({ method, confidence, flagged }: { method: string; confidence: number; flagged?: boolean }) {
  if (flagged) {
    return (
      <Badge variant="outline" className="gap-1 border-red-300 bg-red-50 px-1.5 py-0 text-[10px] text-red-700">
        <ShieldAlert className="h-3 w-3" /> Flagged
      </Badge>
    );
  }
  if (method === 'GTIN') {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-300 bg-emerald-50 px-1.5 py-0 text-[10px] font-medium text-emerald-700">
        <ScanSearch className="h-3 w-3" /> GTIN exact
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-border bg-secondary px-1.5 py-0 text-[10px] text-foreground/80">
      <Clock className="h-3 w-3" /> Fuzzy {(confidence * 100).toFixed(0)}%
    </Badge>
  );
}

/** Which saved scans surface this product (discovered-by first, then filter matches). */
export function ScanChips({ scans, max = 2, className }: { scans?: LeadScanRef[]; max?: number; className?: string }) {
  if (!scans || scans.length === 0) return null;
  const shown = scans.slice(0, max);
  const rest = scans.length - shown.length;
  const title = scans.map((s) => (s.found ? `${s.name} (found it)` : `${s.name} (matches filters)`)).join('\n');
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)} title={title}>
      {shown.map((s) => (
        <Badge
          key={s.id}
          variant="outline"
          className={cn(
            'gap-1 px-1.5 py-0 text-[10px] font-medium',
            s.found ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-sky-200 bg-sky-50 text-sky-700'
          )}
        >
          <Radar className="h-2.5 w-2.5" />
          {s.name}
        </Badge>
      ))}
      {rest > 0 && <span className="text-[10px] text-muted-foreground">+{rest}</span>}
    </div>
  );
}
