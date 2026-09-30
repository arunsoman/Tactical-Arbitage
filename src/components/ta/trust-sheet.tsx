'use client';

// Trust controls (§4 US-4, §5 Trust/Override): override, dispute, and permanent
// suppression with the full taxonomy — brand, category, retailer, ASIN, IP,
// return, gating. Large touch targets, explicit but single-step confirmation.
// Every action writes an immutable audit event server-side.

import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { api, type SuppressionDTO } from '@/lib/ta/api';
import { cn } from '@/lib/utils';
import { Ban, Flag, ScrollText, Trash2 } from 'lucide-react';

export const SUPPRESSION_SCOPES = [
  { id: 'BRAND', label: 'Brand', hint: 'never show this brand again' },
  { id: 'CATEGORY', label: 'Category', hint: 'suppress a whole product category' },
  { id: 'RETAILER', label: 'Retailer', hint: 'stop scanning leads from this store' },
  { id: 'ASIN', label: 'ASIN', hint: 'suppress one Amazon listing' },
  { id: 'IP', label: 'IP risk', hint: 'suppress every IP-claim-flagged pick' },
  { id: 'RETURN', label: 'Return-prone', hint: 'suppress categories you keep returning' },
  { id: 'GATING', label: 'Gated', hint: 'suppress every gated pick' },
] as const;

export interface TrustTarget {
  leadId?: string;
  brand?: string;
  category?: string;
  retailerId?: string;
  retailerName?: string;
  asin?: string;
  hasIpFlag?: boolean;
  hasGatedFlag?: boolean;
}

function TrustForm({ target, onDone }: { target: TrustTarget; onDone: () => void }) {
  const { toast } = useToast();
  const initialScope = target.hasIpFlag ? 'IP' : target.hasGatedFlag ? 'GATING' : 'BRAND';
  const [scope, setScope] = useState<string>(initialScope);
  const [value, setValue] = useState<string>(target.brand ?? target.asin ?? target.category ?? '');
  const [reason, setReason] = useState('');
  const [dispute, setDispute] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setScope(initialScope);
    setValue(target.brand ?? target.asin ?? target.category ?? '');
  }, [target, initialScope]);

  const valueForScope = (s: string): string => {
    switch (s) {
      case 'BRAND': return target.brand ?? '';
      case 'CATEGORY': return target.category ?? '';
      case 'RETAILER': return target.retailerName ?? '';
      case 'ASIN': return target.asin ?? '';
      case 'IP': return '*';
      case 'GATING': return '*';
      case 'RETURN': return target.category ?? '';
      default: return '';
    }
  };

  const pickScope = (s: string) => {
    setScope(s);
    setValue(valueForScope(s));
  };

  const submitSuppression = async () => {
    setBusy(true);
    try {
      const res = await api.trustAction({ action: 'suppress', scope, value, reason, actorRole: 'OWNER' });
      toast({
        title: res.pendingApproval ? 'Sent for approval' : 'Pattern suppressed',
        description: res.pendingApproval ? 'A Manager/Owner must approve this suppression.' : `${scope} "${value}" is permanently excluded from AI picks — audit event recorded.`,
      });
      onDone();
    } catch (e) {
      toast({ title: 'Could not suppress', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const submitDispute = async () => {
    if (!target.leadId || !dispute.trim()) return;
    setBusy(true);
    try {
      await api.trustAction({ action: 'dispute', leadId: target.leadId, reason: dispute });
      toast({ title: 'Dispute recorded', description: 'The pick is flagged for review — your override is in the audit trail.' });
      setDispute('');
      onDone();
    } catch (e) {
      toast({ title: 'Could not dispute', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 px-4 pb-6 pt-2">
      {/* dispute */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold">Dispute this pick</h3>
        </div>
        <p className="text-xs text-muted-foreground">Tell the model why this recommendation is wrong. Disputes are audited and reviewed.</p>
        <Textarea
          placeholder="e.g. BSR is stale — this listing died last week"
          className="min-h-[64px] text-sm"
          value={dispute}
          onChange={(e) => setDispute(e.target.value)}
        />
        <Button variant="outline" className="h-11 w-full border-amber-500/50 text-amber-600 dark:text-amber-400" disabled={busy || !dispute.trim()} onClick={submitDispute}>
          <Flag className="mr-2 h-4 w-4" /> Dispute pick
        </Button>
      </section>

      {/* permanent suppression */}
      <section className="space-y-2 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <Ban className="h-4 w-4 text-red-500" />
          <h3 className="text-sm font-semibold">Suppress a pattern — permanently</h3>
        </div>
        <p className="text-xs text-muted-foreground">Suppressed patterns never appear in AI picks again. You can remove them later in Team → Suppressions.</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Suppression scope">
          {SUPPRESSION_SCOPES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={scope === s.id}
              title={s.hint}
              onClick={() => pickScope(s.id)}
              className={cn(
                'flex h-11 items-center justify-center rounded-lg border text-[13px] font-semibold transition-colors',
                scope === s.id ? 'border-red-500 bg-red-500/10 text-red-600 dark:text-red-400' : 'border-border bg-card text-muted-foreground'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        {scope !== 'IP' && scope !== 'GATING' && (
          <div>
            <Label className="text-xs text-muted-foreground">Value</Label>
            <Input className="mt-1 h-11 text-sm" value={value} onChange={(e) => setValue(e.target.value)} placeholder={valueForScope(scope) || 'exact value to suppress'} />
          </div>
        )}
        <Input className="h-11 text-sm" placeholder="Reason (optional, audited)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button variant="destructive" className="h-11 w-full" disabled={busy || (scope !== 'IP' && scope !== 'GATING' && !value.trim())} onClick={submitSuppression}>
          <Ban className="mr-2 h-4 w-4" /> Suppress permanently
        </Button>
      </section>
    </div>
  );
}

export function TrustSheet({ target, onClose, onChanged }: { target: TrustTarget | null; onClose: () => void; onChanged?: () => void }) {
  // keyed inner component: tab resets to 'act' whenever a new target opens,
  // without setState-in-effect cascades
  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
      <TrustSheetInner key={target?.leadId ?? target?.asin ?? 'none'} target={target} onClose={onClose} onChanged={onChanged} />
    </Sheet>
  );
}

function TrustSheetInner({ target, onClose, onChanged }: { target: TrustTarget | null; onClose: () => void; onChanged?: () => void }) {
  const [tab, setTab] = useState<'act' | 'manage'>('act');
  const [suppressions, setSuppressions] = useState<SuppressionDTO[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.trust().then((r) => {
      if (!cancelled) setSuppressions(r.suppressions);
    }).catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  const remove = async (id: string) => {
    await api.trustAction({ action: 'unsuppress', id }).catch(() => null);
    setSuppressions((s) => s.filter((x) => x.id !== id));
    onChanged?.();
  };

  return (
    <SheetContent side="bottom" className="mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl pb-safe">
        <SheetHeader className="pb-0 text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4 text-emerald-500" /> Trust controls
          </SheetTitle>
          <SheetDescription className="text-xs">Override the AI — human control first (PRD v2.2 §1).</SheetDescription>
        </SheetHeader>

        <div className="mx-4 mt-3 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(['act', 'manage'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn('h-10 rounded-md text-sm font-semibold transition-colors', tab === t ? 'bg-card shadow-sm' : 'text-muted-foreground')}
            >
              {t === 'act' ? 'Dispute / Suppress' : `Suppressions (${suppressions.length})`}
            </button>
          ))}
        </div>

        {tab === 'act' ? (
          target && <TrustForm target={target} onDone={() => { onChanged?.(); }} />
        ) : (
          <div className="space-y-2 px-4 pb-6 pt-3">
            {suppressions.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No suppression patterns yet.</p>}
            {suppressions.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {s.scope} · <span className="font-normal">{s.value}</span>
                  </p>
                  {s.reason && <p className="line-clamp-1 text-xs text-muted-foreground">{s.reason}</p>}
                </div>
                <Button size="icon" variant="ghost" className="h-11 w-11 text-muted-foreground" aria-label="remove suppression" onClick={() => remove(s.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
    </SheetContent>
  );
}
