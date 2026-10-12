'use client';

// Lightweight outcome / feedback loop (investor-demo AI feature set #5).
// One tap stores the signal and feeds the learning machinery that already exists:
//   Bought        → imputed BOUGHT outcome (smart defaults) → recalibrates confidence
//   Not interested→ ASIN suppression → never surfaces again
//   Bad match     → match review queue → excluded from future auto-accepts
// No new tables, no ML training — reuse of the v2.2 trust/outcome layer.

import { useState } from 'react';
import { api } from '@/lib/ta/api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { CheckCircle2, HandHeart, ShoppingBag, ThumbsDown, XCircle } from 'lucide-react';

type FeedbackKind = 'BOUGHT' | 'NOT_INTERESTED' | 'BAD_MATCH';
const DONE: FeedbackKind[] = ['BOUGHT', 'NOT_INTERESTED', 'BAD_MATCH'];

export function QuickFeedbackRow({
  leadId,
  asin,
  buyBox,
  totalCost,
  disabled,
  className,
}: {
  leadId: string;
  asin: string;
  buyBox: number;
  totalCost?: number;
  disabled?: boolean;
  className?: string;
}) {
  const { toast } = useToast();
  const [done, setDone] = useState<FeedbackKind[]>([]);
  const [busy, setBusy] = useState<FeedbackKind | null>(null);

  const record = async (kind: FeedbackKind) => {
    if (busy || done.includes(kind)) return;
    setBusy(kind);
    try {
      if (kind === 'BOUGHT') {
        // imputed estimate with smart defaults — flagged in the model (§5 outcome capture);
        // cost is deferred to the server smart default when the detail hasn't loaded yet
        await api.logOutcome({
          leadId,
          type: 'BOUGHT',
          units: 1,
          unitsSold: 1,
          unitsReturned: 0,
          revenue: buyBox,
          ...(totalCost != null ? { cost: totalCost } : {}),
          imputed: true,
        });
        toast({ title: 'Bought — logged ✓', description: 'Stored as an imputed estimate; confidence recalibrates on the next ranking pass.' });
      } else if (kind === 'NOT_INTERESTED') {
        await api.trustAction({ action: 'suppress', scope: 'ASIN', value: asin, reason: 'Feedback: not interested' });
        toast({ title: 'Not interested — stored ✓', description: `Pattern adjusted: ${asin} will not be recommended again (audit-trailed suppression).` });
      } else {
        await api.flagMatch(leadId, 'Feedback: bad match — wrong product pairing');
        toast({ title: 'Bad match — stored ✓', description: 'Queued for match review and excluded from future auto-accepts.' });
      }
      setDone(DONE.filter((d) => d === kind));
    } catch (e) {
      toast({ title: 'Feedback failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const buttons: { kind: FeedbackKind; label: string; icon: typeof ShoppingBag; active: string }[] = [
    { kind: 'BOUGHT', label: 'Bought', icon: ShoppingBag, active: 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
    { kind: 'NOT_INTERESTED', label: 'Not interested', icon: ThumbsDown, active: 'border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400' },
    { kind: 'BAD_MATCH', label: 'Bad match', icon: XCircle, active: 'border-red-500 bg-red-500/15 text-red-600 dark:text-red-400' },
  ];

  return (
    <div className={className}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quick feedback — trains the ranking</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {buttons.map((b) => (
          <button
            key={b.kind}
            type="button"
            disabled={disabled || busy != null || done.includes(b.kind)}
            onClick={() => void record(b.kind)}
            className={cn(
              'flex h-11 items-center justify-center gap-1.5 rounded-lg border text-[12px] font-semibold transition-colors',
              done.includes(b.kind)
                ? b.active
                : 'border-border bg-card text-muted-foreground enabled:hover:bg-accent disabled:opacity-50',
              done.includes(b.kind) || disabled ? '' : ''
            )}
            aria-label={`Record feedback: ${b.label}`}
          >
            {done.includes(b.kind) ? <CheckCircle2 className="h-4 w-4" /> : <b.icon className={cn('h-4 w-4', busy === b.kind && 'animate-pulse')} />}
            {b.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
        <HandHeart className="mr-1 inline h-3 w-3" aria-hidden />
        One tap stores it — outcomes recalibrate confidence, disinterest suppresses the pattern, bad matches correct the AI. That's the learning loop.
      </p>
    </div>
  );
}