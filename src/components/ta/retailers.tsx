'use client';

// Retailers view — scan coverage, tier cadence SLAs, freshness, per-site health
// (PRD §8 freshness SLA + §11 site-breakage risk), rescan trigger.

import { useCallback, useEffect, useState } from 'react';
import { api, type RetailersDTO } from '@/lib/ta/api';
import { useTAStore } from './store';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { RefreshCw, Store, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn, touchButtonHeight } from '@/lib/utils';

const TIER_TONE: Record<string, string> = {
  A: 'bg-emerald-100 text-emerald-800',
  B: 'bg-amber-100 text-amber-800',
  C: 'bg-secondary text-foreground/80',
};

export function RetailersView() {
  const { bootstrap } = useTAStore();
  const { toast } = useToast();
  const [data, setData] = useState<RetailersDTO | null>(null);
  const [rescanning, setRescanning] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.retailers());
    } catch (e) {
      toast({ title: 'Retailers failed to load', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load, bootstrap]);

  const rescan = async (id: string, name: string) => {
    setRescanning(id);
    try {
      await api.rescanRetailer(id);
      toast({ title: `Rescan complete — ${name}`, description: 'Fresh SKUs matched and priced.' });
      await load();
    } catch (e) {
      toast({ title: 'Rescan failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setRescanning(null);
    }
  };

  const healthy = data?.retailers.filter((r) => r.status === 'healthy').length ?? 0;
  const degraded = data?.retailers.filter((r) => r.status === 'degraded').length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-foreground">Retail network</h2>
          <p className="text-xs text-muted-foreground">
            US network — national chains, warehouse clubs, category specialists & closeout outlets — tiered by cadence: Tier A every 2–4h · Tier B 12–24h · Tier C weekly (FR-1.2). Scaling to 1,200 sites by month 6 (FR-1.1).
          </p>
          <p className="mt-1 text-[11px] italic text-muted-foreground">
            Simulation notice: this demo never contacts these stores — catalog data is generated locally to model the production scan network.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <Badge className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            <CheckCircle2 className="h-3 w-3" /> {healthy} healthy
          </Badge>
          {degraded > 0 && (
            <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100">
              <AlertTriangle className="h-3 w-3" /> {degraded} degraded
            </Badge>
          )}
        </div>
      </div>

      {!data && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data?.retailers.map((r) => {
          const stale = r.avgFreshnessH > r.slaHours;
          return (
            <Card key={r.id} className={cn('border-border shadow-sm', r.status !== 'healthy' && 'border-amber-200 bg-amber-50/30')}>
              <CardHeader className="pb-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-foreground/80">
                      <Store className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-bold leading-tight text-foreground">{r.name}</CardTitle>
                      <p className="text-[11px] text-muted-foreground">{r.domain}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className={cn('px-1.5 py-0 text-[10px] font-bold', TIER_TONE[r.tier])}>
                      Tier {r.tier}
                    </Badge>
                    {r.status === 'healthy' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-secondary p-1.5">
                    <p className="text-[9px] font-medium uppercase text-muted-foreground">Cadence</p>
                    <p className="font-mono text-xs font-bold text-foreground/80">{r.cadenceHours}h</p>
                  </div>
                  <div className="rounded-lg bg-secondary p-1.5">
                    <p className="text-[9px] font-medium uppercase text-muted-foreground">Freshness</p>
                    <p className={cn('font-mono text-xs font-bold', stale ? 'text-amber-600' : 'text-emerald-700')}>{r.avgFreshnessH}h</p>
                  </div>
                  <div className="rounded-lg bg-secondary p-1.5">
                    <p className="text-[9px] font-medium uppercase text-muted-foreground">SKUs</p>
                    <p className="font-mono text-xs font-bold text-foreground/80">{r.productCount}</p>
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Scan coverage (SLA {r.slaHours}h)</span>
                    <span className="font-mono font-semibold">{r.coverage}%</span>
                  </div>
                  <Progress value={r.coverage} className="h-1.5" />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">
                    {r.lastScanAt
                      ? `Last scan ${new Date(r.lastScanAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                      : 'Never scanned'}
                    {r.notes ? ` · ${r.notes}` : ''}
                  </p>
                  <Button size="sm" variant="outline" className={cn(touchButtonHeight, 'gap-1 text-[11px]')} onClick={() => rescan(r.id, r.name)} disabled={rescanning === r.id}>
                    {rescanning === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Rescan
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
