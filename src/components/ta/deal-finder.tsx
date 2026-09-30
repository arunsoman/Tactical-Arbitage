'use client';

// Deal Finder — the hot path (PRD §7.4): full filter panel over the
// denormalized deal store, sortable results table, CSV export (FR-8.1).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type LeadsResponse } from '@/lib/ta/api';
import { useTAStore } from './store';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_FILTERS, RISK_FLAG_META, type LeadFilters, type RiskFlag } from '@/lib/ta/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProductImage } from './product-image';
import { RiskFlagChips, RoiBadge, ProfitText, FreshnessDot, ScanChips } from './badges';
import { Search, Download, RotateCcw, ChevronLeft, ChevronRight, Star, Filter, Radar, X, Save } from 'lucide-react';
import { cn, touchIconSize } from '@/lib/utils';

const SORTS = [
  { id: 'score', label: 'Deal score' },
  { id: 'roi_desc', label: 'ROI — high to low' },
  { id: 'profit_desc', label: 'Profit — high to low' },
  { id: 'price_asc', label: 'Retail price — low to high' },
  { id: 'bsr_asc', label: 'BSR — best first' },
  { id: 'discount_desc', label: 'Discount — deepest first' },
  { id: 'newest', label: 'Newest first' },
];

const FLAG_KEYS = Object.keys(RISK_FLAG_META) as RiskFlag[];

export function DealFinderView() {
  const { filters, setFilters, resetFilters, openLead, bootstrap, dealRefreshKey, activeScan, newOnly, setNewOnly, clearScan } = useTAStore();
  const { toast } = useToast();

  const [data, setData] = useState<LeadsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('score');
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterVersion, setFilterVersion] = useState(0); // remounts the uncontrolled filter inputs on reset
  const [savingScan, setSavingScan] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.leads(filters, sort, page, 25, activeScan && newOnly ? activeScan.since : null));
    } catch (e) {
      toast({ title: 'Could not load leads', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [filters, sort, page, toast, activeScan, newOnly]);

  useEffect(() => {
    load();
  }, [load, dealRefreshKey]);

  // entering a scan's "new items" view: newest first so the fresh finds are on top
  useEffect(() => {
    if (activeScan && newOnly) setSort('newest');
    setPage(1);
  }, [activeScan?.id, newOnly]);

  const doReset = () => {
    resetFilters();
    setFilterVersion((v) => v + 1);
    setPage(1);
  };

  const saveFiltersToScan = async () => {
    if (!activeScan) return;
    setSavingScan(true);
    try {
      await api.updateScanSet(activeScan.id, { filters });
      toast({ title: 'Scan updated', description: `"${activeScan.name}" now uses the filters currently applied.` });
    } catch (e) {
      toast({ title: 'Could not update scan', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSavingScan(false);
    }
  };

  const patch = (p: Partial<LeadFilters>) => {
    setFilters({ ...filters, ...p });
    setPage(1);
  };

  const setSearch = (search: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => patch({ search }), 300);
  };

  const toggleIn = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.categories.length) n++;
    if (filters.retailers.length) n++;
    if (filters.minPrice != null || filters.maxPrice != null) n++;
    if (filters.minProfit != null) n++;
    if (filters.minRoi != null) n++;
    if (filters.maxBsr != null) n++;
    if (filters.minDiscount != null) n++;
    if (filters.excludeFlags.length) n++;
    if (filters.amazonOnListing !== 'any') n++;
    if (!filters.requireFresh) n++;
    return n;
  }, [filters]);

  const exportCsv = () => {
    const params = new URLSearchParams({ filters: JSON.stringify(filters) });
    window.open(`/api/export?${params}`, '_blank');
    toast({ title: 'CSV export started', description: 'Column-complete export of the current result set.' });
  };

  const saveToPipeline = async (leadId: string) => {
    setSaving(leadId);
    try {
      const res = await api.saveToPipeline(leadId);
      const warn = res.warnings?.length ? `Heads up: ${res.warnings.join(', ')} — check before buying.` : null;
      toast({ title: res.existed ? 'Already in your pipeline' : 'Saved to pipeline', description: res.existed ? 'Track it from the Pipeline view.' : warn ?? 'Status set to NEW.', variant: warn ? 'destructive' : undefined });
      load();
    } catch (e) {
      toast({ title: 'Save failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (data?.pageSize ?? 25)));

  return (
    <div className="flex flex-col gap-4 xl:flex-row">
      {/* ---------- filter sidebar ---------- */}
      <Card className="w-full shrink-0 self-start border-border p-4 shadow-sm xl:sticky xl:top-[72px] xl:w-64">
        <div className="flex items-center justify-between xl:mb-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground/80">
            <Filter className="h-3.5 w-3.5" /> Filters
            {activeFilterCount > 0 && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{activeFilterCount}</Badge>}
          </div>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={doReset}>
            <RotateCcw className="mr-1 h-3 w-3" /> Reset
          </Button>
        </div>

        <Button type="button" variant="outline" size="sm" className="mt-3 w-full justify-center text-xs xl:hidden" onClick={() => setFiltersOpen((open) => !open)}>
          {filtersOpen ? 'Hide filter controls' : 'Show filter controls'}
        </Button>

        <div key={filterVersion} className={cn('mt-4 space-y-4 xl:mt-0 xl:block', filtersOpen ? 'block' : 'hidden')}>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Title, brand, ASIN, store…" className="pl-8" defaultValue={filters.search} onChange={(e) => setSearch(e.target.value)} aria-label="Search leads" />
          </div>

          <div>
            <Label className="text-xs font-semibold text-foreground/80">Category</Label>
            <div className="mt-1.5 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {(bootstrap?.categories ?? []).map((c) => (
                <Label key={c} className="flex cursor-pointer items-center gap-2 text-xs font-normal text-foreground/80">
                  <Checkbox checked={filters.categories.includes(c)} onCheckedChange={() => patch({ categories: toggleIn(filters.categories, c) })} />
                  {c}
                </Label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs font-semibold text-foreground/80">Min ROI %</Label>
              <Input
                type="number"
                className="mt-1 h-8"
                placeholder="30"
                defaultValue={filters.minRoi ?? ''}
                onChange={(e) => patch({ minRoi: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-foreground/80">Min profit $</Label>
              <Input
                type="number"
                className="mt-1 h-8"
                placeholder="5"
                defaultValue={filters.minProfit ?? ''}
                onChange={(e) => patch({ minProfit: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-foreground/80">Price min $</Label>
              <Input type="number" className="mt-1 h-8" placeholder="0" defaultValue={filters.minPrice ?? ''} onChange={(e) => patch({ minPrice: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-foreground/80">Price max $</Label>
              <Input type="number" className="mt-1 h-8" placeholder="—" defaultValue={filters.maxPrice ?? ''} onChange={(e) => patch({ maxPrice: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-foreground/80">Max BSR</Label>
              <Input type="number" className="mt-1 h-8" placeholder="150000" defaultValue={filters.maxBsr ?? ''} onChange={(e) => patch({ maxBsr: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-foreground/80">Min discount %</Label>
              <Input type="number" className="mt-1 h-8" placeholder="—" defaultValue={filters.minDiscount ?? ''} onChange={(e) => patch({ minDiscount: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold text-foreground/80">Amazon on listing</Label>
            <Select value={filters.amazonOnListing} onValueChange={(v) => patch({ amazonOnListing: v as LeadFilters['amazonOnListing'] })}>
              <SelectTrigger className="mt-1 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any seller</SelectItem>
                <SelectItem value="exclude">Exclude Amazon Retail</SelectItem>
                <SelectItem value="only">Only Amazon Retail</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-semibold text-foreground/80">Exclude risk flags</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {FLAG_KEYS.map((f) => (
                <Label key={f} className="flex cursor-pointer items-center gap-1.5 text-[11px] font-normal text-foreground/80">
                  <Checkbox checked={filters.excludeFlags.includes(f)} onCheckedChange={() => patch({ excludeFlags: toggleIn(filters.excludeFlags, f) })} />
                  {RISK_FLAG_META[f].label}
                </Label>
              ))}
            </div>
          </div>

          <Label className="flex cursor-pointer items-center gap-2 text-xs text-foreground/80">
            <Checkbox checked={filters.requireFresh} onCheckedChange={(v) => patch({ requireFresh: v === true })} />
            Fresh prices only (within site-tier SLA)
          </Label>

          <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> Export results CSV
          </Button>
        </div>
      </Card>

      {/* ---------- results ---------- */}
      <div className="min-w-0 flex-1 space-y-3">
        {activeScan && (
          <Card className="border-emerald-200 bg-emerald-50/60 p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Radar className="h-4 w-4 shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">Scan: {activeScan.name}</p>
                  <p className="text-[11px] text-muted-foreground">Adjust the filters on the left, then save them back to the scan if you like the result.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex overflow-hidden rounded-md border border-emerald-200 bg-card text-[11px] font-medium">
                  <button
                    className={cn('px-2.5 py-1.5', newOnly ? 'bg-emerald-600 text-white' : 'text-foreground/80 hover:bg-accent')}
                    onClick={() => setNewOnly(true)}
                  >
                    New from last run{activeScan.newCount > 0 ? ` (${activeScan.newCount})` : ''}
                  </button>
                  <button
                    className={cn('px-2.5 py-1.5', !newOnly ? 'bg-emerald-600 text-white' : 'text-foreground/80 hover:bg-accent')}
                    onClick={() => setNewOnly(false)}
                  >
                    All matching
                  </button>
                </div>
                <Button size="sm" variant="outline" className="h-8 gap-1 bg-card text-[11px]" onClick={saveFiltersToScan} disabled={savingScan}>
                  <Save className="h-3 w-3" /> Save filters to scan
                </Button>
                <Button size="sm" variant="ghost" className="h-8 gap-1 text-[11px] text-muted-foreground" onClick={clearScan}>
                  <X className="h-3 w-3" /> Exit scan
                </Button>
              </div>
            </div>
          </Card>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-foreground/80" aria-live="polite">
            {loading ? 'Querying deal store…' : (
              <>
                <b className="font-mono">{total.toLocaleString()}</b> leads match · page {page} of {totalPages}
              </>
            )}
          </p>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1); }}>
              <SelectTrigger className="h-9 flex-1 text-xs sm:w-48 sm:flex-none">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className={touchIconSize} disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className={touchIconSize} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <Card className="overflow-hidden border-border shadow-sm">
          {/* header */}
          <div className="hidden grid-cols-[minmax(240px,1fr)_92px_84px_84px_76px_120px_84px] items-center gap-2 border-b border-border bg-secondary px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground lg:grid">
            <span>Product / source</span>
            <span className="text-right">Retail</span>
            <span className="text-right">Buy box</span>
            <span className="text-right">Profit</span>
            <span className="text-right">ROI</span>
            <span>Risk & flags</span>
            <span className="text-right">Actions</span>
          </div>

          {loading &&
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="m-2 h-16 rounded-lg" />)}

          {!loading && rows.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Search className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground/80">{activeScan && newOnly ? 'No new items from the last run' : 'No leads match these filters'}</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                {activeScan && newOnly
                  ? 'The last run found nothing new that passes this scan’s filters. Switch to “All matching”, or run the scan again.'
                  : 'Try relaxing min ROI/profit, clearing risk-flag exclusions, or running a new scan cycle — fresh stock lands every few hours.'}
              </p>
              {activeScan && newOnly ? (
                <Button size="sm" variant="outline" className="mt-1 text-xs" onClick={() => setNewOnly(false)}>
                  Show all matching
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="mt-1 text-xs" onClick={doReset}>
                  Clear filters
                </Button>
              )}
            </div>
          )}

          {!loading &&
            rows.map((l) => {
              const inPipeline = !!l.pipeline;
              return (
                <div
                  key={l.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openLead(l.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openLead(l.id)}
                  className="grid cursor-pointer grid-cols-1 items-center gap-2 border-b border-border px-3 py-2.5 transition-colors last:border-0 hover:bg-accent lg:grid-cols-[minmax(240px,1fr)_92px_84px_84px_76px_120px_84px]"
                >
                  {/* product */}
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ProductImage imageKey={l.imageUrl} title={l.title} category={l.category} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{l.title}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground/80">{l.retailerName}</span>
                        <Badge variant="outline" className="px-1 py-0 text-[9px] font-bold text-muted-foreground">{l.retailerTier}</Badge>
                        <span className="font-mono">{l.asin}</span>
                        <span>·</span>
                        <span>BSR {l.bsr.toLocaleString()}</span>
                        <span>·</span>
                        <span>{l.fbaOffers} FBA</span>
                        {l.couponPct > 0 && (
                          <Badge className="bg-amber-100 px-1 py-0 text-[9px] font-semibold text-amber-800 hover:bg-amber-100">{l.couponPct}% coupon</Badge>
                        )}
                        <FreshnessDot fresh={l.fresh} ageH={l.priceAgeH} tier={l.retailerTier} />
                      </div>
                      <ScanChips scans={l.scans} max={2} className="mt-1" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-secondary p-2 lg:hidden">
                    <div><p className="text-[10px] uppercase text-muted-foreground">Retail</p><p className="font-mono text-sm font-semibold">${l.retailerPrice.toFixed(2)}</p></div>
                    <div><p className="text-[10px] uppercase text-muted-foreground">Buy box</p><p className="font-mono text-sm font-semibold">${l.buyBox.toFixed(2)}</p></div>
                    <div><p className="text-[10px] uppercase text-muted-foreground">Profit</p><ProfitText value={l.netProfit} /></div>
                    <div><p className="text-[10px] uppercase text-muted-foreground">ROI</p><RoiBadge roi={l.roiPct} /></div>
                    <div className="col-span-2"><RiskFlagChips flags={l.riskFlags} max={4} /></div>
                  </div>

                  {/* retail price */}
                  <div className="hidden text-right lg:block">
                    <p className="font-mono text-sm font-semibold tabular-nums text-foreground">${l.retailerPrice.toFixed(2)}</p>
                    {l.discountPct > 0 && (
                      <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        <s>${l.listPrice.toFixed(2)}</s> −{l.discountPct.toFixed(0)}%
                      </p>
                    )}
                  </div>

                  {/* buy box */}
                  <p className="hidden text-right font-mono text-sm tabular-nums text-foreground/80 lg:block">${l.buyBox.toFixed(2)}</p>

                  {/* profit */}
                  <div className="hidden text-right lg:block">
                    <ProfitText value={l.netProfit} />
                    <p className="font-mono text-[10px] tabular-nums text-muted-foreground">{l.marginPct.toFixed(0)}% margin</p>
                  </div>

                  {/* roi */}
                  <div className="hidden text-right lg:block">
                    <RoiBadge roi={l.roiPct} />
                  </div>

                  {/* flags */}
                  <div className="hidden lg:block">
                    <RiskFlagChips flags={l.riskFlags} max={3} />
                  </div>

                  {/* actions */}
                  <div className="flex justify-end gap-1 lg:justify-end" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant={inPipeline ? 'secondary' : 'outline'}
                      className={cn('h-7 gap-1 px-2 text-[11px]', inPipeline && 'bg-emerald-50 text-emerald-700')}
                      disabled={inPipeline || saving === l.id}
                      onClick={() => saveToPipeline(l.id)}
                      aria-label={inPipeline ? 'Already saved to pipeline' : 'Save lead to pipeline'}
                    >
                      <Star className={cn('h-3 w-3', inPipeline && 'fill-emerald-600')} />
                      {inPipeline ? 'Saved' : 'Save'}
                    </Button>
                  </div>
                </div>
              );
            })}
        </Card>

        {!loading && rows.length > 0 && (
          <div className="flex items-center justify-between pb-2 text-xs text-muted-foreground">
            <span>
              Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} of {total.toLocaleString()}
            </span>
            <span className="hidden md:inline">Click any row for the full fee breakdown and price history</span>
          </div>
        )}
      </div>
    </div>
  );
}
