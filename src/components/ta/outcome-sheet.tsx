'use client';

// Outcome quick-entry (§4 US-7, §5 Outcome Capture): mobile-optimized form —
// segmented outcome type, steppers, smart defaults prefilled from deal math,
// live realized-profit preview, optional note. One or two taps to log.

import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { api, type PendingOutcomeDTO } from '@/lib/ta/api';
import { cn } from '@/lib/utils';
import { fmtMoney } from '@/lib/ta/profit';
import { CheckCircle2 } from 'lucide-react';

const OUTCOME_TYPES = [
  { id: 'BOUGHT', label: 'Bought', desc: 'Purchased and selling through' },
  { id: 'MULTI_UNIT', label: 'Multi-unit', desc: 'Bought several units' },
  { id: 'PARTIAL', label: 'Partial', desc: 'Some units sold, some left' },
  { id: 'RETURNED', label: 'Returned', desc: 'Sent back to the retailer' },
  { id: 'CANCELLED', label: 'Cancelled', desc: 'Order cancelled' },
] as const;

export interface OutcomeSheetTarget {
  leadId: string;
  title: string;
  buyBox: number;
  totalCost: number;
  roiPct: number;
}

export function OutcomeSheet({
  target,
  onClose,
  onLogged,
}: {
  target: OutcomeSheetTarget | null;
  onClose: () => void;
  onLogged?: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<string>('BOUGHT');
  const [units, setUnits] = useState(1);
  const [unitsSold, setUnitsSold] = useState(1);
  const [unitsReturned, setUnitsReturned] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [cost, setCost] = useState(0);
  const [imputed, setImputed] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setType('BOUGHT');
    setUnits(1);
    setUnitsSold(1);
    setUnitsReturned(0);
    // smart defaults from the deal's own math (§10: forms minimize typing)
    setRevenue(Number(target.buyBox.toFixed(2)));
    setCost(Number(target.totalCost.toFixed(2)));
    setImputed(false);
    setNote('');
  }, [target]);

  const preview = useMemo(() => {
    if (type === 'CANCELLED') return { profit: 0, roi: 0, win: false };
    const profit = revenue - cost;
    const roi = cost > 0 ? (profit / cost) * 100 : 0;
    return { profit, roi, win: profit > 0 && roi >= 15 };
  }, [type, revenue, cost]);

  const setPreset = (t: string) => {
    setType(t);
    if (t === 'RETURNED') {
      setUnitsSold(0);
      setUnitsReturned(units);
      setRevenue(0);
    } else if (t === 'CANCELLED') {
      setUnitsSold(0);
      setRevenue(0);
    } else {
      setUnitsSold(units);
      setUnitsReturned(0);
      setRevenue(Number((units * (target?.buyBox ?? 0)).toFixed(2)));
    }
  };

  const submit = async () => {
    if (!target) return;
    setSaving(true);
    try {
      const res = await api.logOutcome({
        leadId: target.leadId,
        type,
        units,
        unitsSold,
        unitsReturned,
        revenue,
        cost,
        imputed,
        note: note || undefined,
      });
      toast({
        title: res.win ? 'Outcome logged — win ✓' : 'Outcome logged',
        description: `${type.replace('_', ' ').toLowerCase()} · realized ${fmtMoney(res.outcome.netProfit)} (${res.outcome.roiPct.toFixed(0)}% ROI)${imputed ? ' · imputed estimate' : ''}. Ranking recalibrates on the next pick refresh.`,
      });
      onLogged?.();
      onClose();
    } catch (e) {
      toast({ title: 'Could not log outcome', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] w-full max-w-md rounded-t-2xl overflow-y-auto pb-safe">
        <SheetHeader className="pb-0 text-left">
          <SheetTitle className="text-base">Log outcome</SheetTitle>
          <SheetDescription className="line-clamp-1 text-xs">{target?.title}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-5 pt-3">
          {/* outcome type — segmented, large targets */}
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Outcome type">
            {OUTCOME_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={type === t.id}
                onClick={() => setPreset(t.id)}
                className={cn(
                  'flex h-11 items-center justify-center rounded-lg border text-[13px] font-semibold transition-colors',
                  type === t.id ? 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'border-border bg-card text-muted-foreground'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* units steppers */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Units</Label>
              <div className="mt-1 flex items-center rounded-lg border border-border">
                <button type="button" className="h-11 w-9 text-lg" aria-label="decrease units" onClick={() => { const u = Math.max(1, units - 1); setUnits(u); if (type !== 'RETURNED' && type !== 'CANCELLED') { setUnitsSold(u); setRevenue(Number((u * (target?.buyBox ?? 0)).toFixed(2))); setCost(Number((u * (target?.totalCost ?? 0)).toFixed(2))); } }}>−</button>
                <span className="flex-1 text-center text-sm font-semibold">{units}</span>
                <button type="button" className="h-11 w-9 text-lg" aria-label="increase units" onClick={() => { const u = Math.min(999, units + 1); setUnits(u); if (type !== 'RETURNED' && type !== 'CANCELLED') { setUnitsSold(u); setUnitsSold(u); setRevenue(Number((u * (target?.buyBox ?? 0)).toFixed(2))); setCost(Number((u * (target?.totalCost ?? 0)).toFixed(2))); } }}>+</button>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Sold</Label>
              <Input inputMode="numeric" className="mt-1 h-11 text-center" value={unitsSold} onChange={(e) => setUnitsSold(Math.max(0, parseInt(e.target.value) || 0))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Returned</Label>
              <Input inputMode="numeric" className="mt-1 h-11 text-center" value={unitsReturned} onChange={(e) => setUnitsReturned(Math.max(0, parseInt(e.target.value) || 0))} />
            </div>
          </div>

          {/* money */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Revenue ($)</Label>
              <Input inputMode="decimal" className="mt-1 h-11" value={revenue} onChange={(e) => setRevenue(parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Cost ($)</Label>
              <Input inputMode="decimal" className="mt-1 h-11" value={cost} onChange={(e) => setCost(parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          {/* realized preview */}
          <div className={cn('flex items-center justify-between rounded-xl border p-3', preview.win ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-border bg-muted/40')}>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Realized</p>
              <p className={cn('text-lg font-bold', preview.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                {fmtMoney(preview.profit)} · {preview.roi.toFixed(0)}% ROI
              </p>
            </div>
            {preview.win && <CheckCircle2 className="h-6 w-6 text-emerald-500" aria-label="meets your ROI target" />}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-medium">Imputed estimate</p>
              <p className="text-xs text-muted-foreground">Log later with a smart default — flagged in the model</p>
            </div>
            <Switch checked={imputed} onCheckedChange={setImputed} aria-label="mark as imputed estimate" />
          </div>

          <Textarea placeholder="Note (optional) — e.g. '2 units damaged in transit'" className="min-h-[64px] text-sm" value={note} onChange={(e) => setNote(e.target.value)} />

          <Button className="h-12 w-full bg-emerald-600 text-base font-semibold hover:bg-emerald-500" disabled={saving} onClick={submit}>
            {saving ? 'Logging…' : 'Log outcome'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Compact prompt row for pending outcomes (learning health ≥ 80% target, §3). */
export function PendingOutcomeRow({ item, onQuickLog, onOpen }: { item: PendingOutcomeDTO; onQuickLog: (item: PendingOutcomeDTO) => void; onOpen: (leadId: string) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(item.lead.id)}>
        <p className="line-clamp-1 text-sm font-medium">{item.lead.title}</p>
        <p className="text-xs text-muted-foreground">
          {item.lead.retailerName} · bought at {fmtMoney(item.lead.retailerPrice)} · est. profit {fmtMoney(item.lead.netProfit)}
        </p>
      </button>
      <Button size="sm" variant="outline" className="h-11 shrink-0 border-emerald-500/40 text-emerald-600 dark:text-emerald-400" onClick={() => onQuickLog(item)}>
        Log
      </Button>
    </div>
  );
}
