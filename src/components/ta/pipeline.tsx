'use client';

// Pipeline / lead management (FR-7.1/7.3): status board with lead → shipped flow,
// notes, tags, quantity, bulk CSV export (Inventory Lab-friendly columns).

import { useCallback, useEffect, useState } from 'react';
import { api, type PipelineItemDTO } from '@/lib/ta/api';
import { useTAStore } from './store';
import { useToast } from '@/hooks/use-toast';
import { PIPELINE_STATUSES } from '@/lib/ta/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProductImage } from './product-image';
import { RiskFlagChips, ProfitText } from './badges';
import { Download, Trash2, ChevronLeft, ChevronRight, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<string, string> = {
  NEW: 'bg-slate-100 text-slate-700',
  INTERESTED: 'bg-amber-100 text-amber-800',
  PURCHASED: 'bg-teal-100 text-teal-800',
  SHIPPED: 'bg-lime-100 text-lime-800',
  LIVE: 'bg-emerald-100 text-emerald-800',
  WON: 'bg-emerald-600 text-white',
  LOST: 'bg-red-100 text-red-700',
};

export function PipelineView() {
  const { openLead } = useTAStore();
  const { toast } = useToast();
  const [items, setItems] = useState<PipelineItemDTO[] | null>(null);
  const [page, setPage] = useState(0);
  const perPage = 12;
  const pages = Math.max(1, Math.ceil((items?.length ?? 0) / perPage));
  const visible = items?.slice(page * perPage, page * perPage + perPage) ?? [];

  const load = useCallback(async () => {
    try {
      const res = await api.pipeline();
      setItems(res.items);
    } catch (e) {
      toast({ title: 'Pipeline failed to load', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const setStatus = async (item: PipelineItemDTO, status: string) => {
    setItems((prev) => prev?.map((i) => (i.id === item.id ? { ...i, status } : i)) ?? null);
    try {
      await api.updatePipeline(item.id, { status });
      toast({ title: `Lead → ${status}`, description: item.lead.title.slice(0, 60) });
    } catch {
      load();
    }
  };

  const remove = async (item: PipelineItemDTO) => {
    setItems((prev) => prev?.filter((i) => i.id !== item.id) ?? null);
    try {
      await api.deletePipeline(item.id);
      toast({ title: 'Removed from pipeline' });
    } catch {
      load();
    }
  };

  const exportCsv = () => {
    window.open('/api/export?type=pipeline', '_blank');
    toast({ title: 'Pipeline CSV export started', description: 'Compatible with prep-center and Inventory Lab imports (FR-8.2).' });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Sourcing pipeline</h2>
          <p className="text-xs text-slate-500">New → Interested → Purchased → Shipped → Live → Won/Lost (FR-7.1)</p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" /> Export pipeline CSV
        </Button>
      </div>

      {/* status ribbon */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {PIPELINE_STATUSES.map((st) => {
          const n = items?.filter((i) => i.status === st).length ?? 0;
          return (
            <Card key={st} className="border-slate-200 p-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{st}</p>
              <p className="mt-0.5 font-mono text-xl font-bold tabular-nums text-slate-800">{n}</p>
            </Card>
          );
        })}
      </div>

      {items === null && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}

      {items !== null && items.length === 0 && (
        <Card className="border-dashed">
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm font-medium text-slate-600">Pipeline is empty</p>
            <p className="max-w-sm text-xs text-slate-400">Save leads from the Deal Finder to track them from discovery to shipped.</p>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {visible.map((item) => (
          <Card key={item.id} className="border-slate-200 p-3 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openLead(item.lead.id)}>
                <ProductImage imageKey={item.lead.imageUrl} title={item.lead.title} category={item.lead.category} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{item.lead.title}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                    <span className="font-medium text-slate-600">{item.lead.retailerName}</span>
                    <span className="font-mono">${item.lead.retailerPrice.toFixed(2)} → ${item.lead.buyBox.toFixed(2)}</span>
                    <ProfitText value={item.lead.netProfit} className="text-xs" />
                    <RiskFlagChips flags={item.lead.riskFlags} max={2} />
                  </div>
                  {item.notes && <p className="mt-1 truncate text-[11px] italic text-slate-400">“{item.notes}”</p>}
                </div>
              </button>

              <div className="flex shrink-0 items-center gap-2 lg:ml-auto">
                {item.owner !== 'Main' && (
                  <Badge variant="outline" className="gap-1 text-[10px] text-slate-500">
                    <UserRound className="h-3 w-3" /> {item.owner}
                  </Badge>
                )}
                {item.qty > 1 && <Badge variant="secondary" className="text-[10px]">×{item.qty}</Badge>}
                <Badge className={cn('px-2 py-0.5 text-[10px] font-bold', STATUS_TONE[item.status])}>{item.status}</Badge>
                <Select value={item.status} onValueChange={(v) => setStatus(item, v)}>
                  <SelectTrigger className="h-8 w-28 bg-white text-[11px]" aria-label="Change status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PIPELINE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => remove(item)} aria-label="Remove from pipeline">
                  <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-500" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {items !== null && items.length > perPage && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {page * perPage + 1}–{Math.min((page + 1) * perPage, items.length)} of {items.length}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
