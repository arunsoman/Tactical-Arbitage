'use client';

// Saved Scans (FR-4.3): named filter sets with schedules, run-now, edit, delete.

import { useCallback, useEffect, useState } from 'react';
import { api, type ScanSetDTO } from '@/lib/ta/api';
import { useTAStore } from './store';
import { useToast } from '@/hooks/use-toast';
import { SCHEDULE_LABELS, RISK_FLAG_META, type ScanSchedule, type RiskFlag } from '@/lib/ta/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Play, Plus, Trash2, Pencil, Loader2 } from 'lucide-react';
import { DEFAULT_FILTERS, type LeadFilters } from '@/lib/ta/types';

function FiltersSummary({ f }: { f: LeadFilters }) {
  const parts: string[] = [];
  if (f.categories.length) parts.push(f.categories.join(', '));
  if (f.minRoi != null) parts.push(`ROI ≥ ${f.minRoi}%`);
  if (f.minProfit != null) parts.push(`$${f.minProfit}+ profit`);
  if (f.maxBsr != null) parts.push(`BSR ≤ ${f.maxBsr.toLocaleString()}`);
  if (f.excludeFlags.length) parts.push(`no ${f.excludeFlags.map((x) => RISK_FLAG_META[x as RiskFlag]?.label ?? x).join('/')}`);
  if (!f.requireFresh) parts.push('include stale');
  return <p className="text-xs text-slate-500">{parts.length ? parts.join(' · ') : 'All categories, no thresholds'}</p>;
}

export function SavedScansView() {
  const { openLead, bootstrap } = useTAStore();
  const { toast } = useToast();
  const [scans, setScans] = useState<ScanSetDTO[] | null>(null);
  const [planLimit, setPlanLimit] = useState<number | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState<ScanSchedule>('daily');
  const [minRoi, setMinRoi] = useState('30');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.scanSets();
      setScans(res.scans);
      setPlanLimit(res.planLimit);
    } catch (e) {
      toast({ title: 'Failed to load scans', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load, bootstrap]);

  const runNow = async (scan: ScanSetDTO) => {
    setRunning(scan.id);
    try {
      const res = await api.scanRun({ scanSetId: scan.id, retailerLimit: 4 });
      const t = res.summary.totals;
      toast({ title: `"${scan.name}" scan complete`, description: `${t.newLeads} new matching leads · ${t.priceUpdates} price updates · ${t.jobs} retailers` });
      await load();
    } catch (e) {
      toast({ title: 'Scan failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setRunning(null);
    }
  };

  const toggleActive = async (scan: ScanSetDTO, active: boolean) => {
    setScans((prev) => prev?.map((s) => (s.id === scan.id ? { ...s, active } : s)) ?? null);
    try {
      await api.updateScanSet(scan.id, { active });
    } catch {
      load();
    }
  };

  const remove = async (scan: ScanSetDTO) => {
    try {
      await api.deleteScanSet(scan.id);
      toast({ title: 'Scan deleted' });
      load();
    } catch (e) {
      toast({ title: 'Delete failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.createScanSet({
        name: name.trim(),
        schedule,
        filters: { ...DEFAULT_FILTERS, minRoi: minRoi === '' ? null : Number(minRoi), requireFresh: true },
      });
      toast({ title: 'Scan saved', description: `"${name.trim()}" now runs ${SCHEDULE_LABELS[schedule].toLowerCase()}.` });
      setCreateOpen(false);
      setName('');
      load();
    } catch (e) {
      toast({ title: 'Could not save scan', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Saved scans</h2>
          <p className="text-xs text-slate-500">
            Persistent, deduplicating result feeds per scan (FR-4.3)
            {planLimit != null && ` · ${scans?.length ?? 0}/${planLimit} used on your plan`}
          </p>
        </div>
        <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-500" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> New scan
        </Button>
      </div>

      {scans === null && (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      )}

      {scans !== null && scans.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm font-medium text-slate-600">No saved scans yet</p>
            <p className="max-w-sm text-xs text-slate-400">Scans re-run on a schedule, dedupe their results, and feed your daily digest.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {scans?.map((s) => (
          <Card key={s.id} className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-800">{s.name}</CardTitle>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {SCHEDULE_LABELS[s.schedule]}
                    {s.lastRunAt && ` · last run ${new Date(s.lastRunAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Switch checked={s.active} onCheckedChange={(v) => toggleActive(s, v)} aria-label={`Toggle ${s.name}`} />
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Edit scan">
                    <Pencil className="h-3.5 w-3.5 text-slate-400" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(s)} aria-label={`Delete ${s.name}`}>
                    <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-500" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <FiltersSummary f={s.filters} />
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <div className="text-xs">
                  <span className="font-bold text-emerald-700">+{s.newSinceRun}</span>
                  <span className="text-slate-500"> new since last run · </span>
                  <span className="font-semibold text-slate-700">{s.total}</span>
                  <span className="text-slate-500"> total in feed</span>
                </div>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => runNow(s)} disabled={running === s.id}>
                  {running === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                  Run now
                </Button>
              </div>
              {s.filters.categories.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {s.filters.categories.map((c) => (
                    <Badge key={c} variant="secondary" className="px-1.5 py-0 text-[10px] text-slate-600">
                      {c}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New saved scan</DialogTitle>
            <DialogDescription>Pick a schedule and ROI floor. Category and flag filters can be refined from Deal Finder.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs font-semibold text-slate-600">Name</Label>
              <Input className="mt-1" placeholder="e.g. Q4 toy clearance sweep" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-600">Schedule</Label>
                <Select value={schedule} onValueChange={(v) => setSchedule(v as ScanSchedule)}>
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SCHEDULE_LABELS) as ScanSchedule[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {SCHEDULE_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Min ROI %</Label>
                <Input className="mt-1" type="number" value={minRoi} onChange={(e) => setMinRoi(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500" onClick={create} disabled={busy || !name.trim()}>
              Save scan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
