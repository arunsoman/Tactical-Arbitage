'use client';

// Lead detail drawer (PRD §6 step 4): full fee breakdown, Keepa-style
// price/rank history, breakeven (FR-3.5), match provenance, pipeline actions,
// and bad-match flagging (FR-2.4).

import { useCallback, useEffect, useState } from 'react';
import { api, type LeadDetailDTO } from '@/lib/ta/api';
import { useTAStore } from './store';
import { useToast } from '@/hooks/use-toast';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProductImage } from './product-image';
import { RiskFlagChips, MatchBadge, RoiBadge, ProfitText, FreshnessDot, ScanChips } from './badges';
import { RISK_FLAG_META, PIPELINE_STATUSES } from '@/lib/ta/types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ExternalLink, Star, ShieldAlert, Info, Boxes, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

const SIZE_TIER_LABEL: Record<string, string> = {
  SMALL_STANDARD: 'Small standard',
  LARGE_STANDARD: 'Large standard',
  SMALL_OVERSIZE: 'Small oversize',
  MEDIUM_OVERSIZE: 'Medium oversize',
};

export function LeadDrawer() {
  const { selectedLeadId, openLead, bumpDealRefresh } = useTAStore();
  const { toast } = useToast();
  const [detail, setDetail] = useState<LeadDetailDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>('NEW');

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setDetail(null);
    try {
      const d = await api.leadDetail(id);
      setDetail(d);
      setStatus(d.pipeline?.status ?? 'NEW');
    } catch (e) {
      toast({ title: 'Lead detail failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
      openLead(null);
    } finally {
      setLoading(false);
    }
  }, []);
  // toast is stable across renders; openLead comes from the store

  useEffect(() => {
    if (selectedLeadId) load(selectedLeadId);
  }, [selectedLeadId, load]);

  const close = () => openLead(null);

  const saveToPipeline = async (nextStatus?: string) => {
    if (!detail) return;
    setBusy(true);
    try {
      if (detail.pipeline) {
        await api.updatePipeline(detail.pipeline.id, { status: nextStatus ?? status });
        toast({ title: 'Pipeline updated', description: `Status → ${nextStatus ?? status}` });
      } else {
        const saved = await api.saveToPipeline(detail.lead.id);
        if (nextStatus && nextStatus !== 'NEW') await api.updatePipeline((await api.pipeline()).items.find((i) => i.lead.id === detail.lead.id)!.id, { status: nextStatus });
        const warn = saved.warnings?.length ? `Heads up: ${saved.warnings.join(', ')} — check before buying.` : null;
        toast({ title: 'Saved to pipeline', description: warn ?? `Status → ${nextStatus ?? 'NEW'}`, variant: warn ? 'destructive' : undefined });
      }
      await load(detail.lead.id);
      bumpDealRefresh();
    } catch (e) {
      toast({ title: 'Pipeline action failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const flagMatch = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await api.flagMatch(detail.lead.id, 'User flagged: wrong product match');
      toast({ title: 'Bad match flagged', description: 'Queued for correction — fixes feed the matching model (<72h SLA).' });
      await load(detail.lead.id);
    } catch (e) {
      toast({ title: 'Flag failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const l = detail?.lead;
  const li = detail?.listing;
  const m = detail?.match;

  const feeRows = l
    ? [
        { label: 'Retailer price', value: l.retailerPrice, note: `${detail?.retailer.name ?? ''} effective price` },
        ...(l.couponPct > 0 ? [{ label: `Coupon applied`, value: 0, note: `${l.couponPct}% already stacked in` }] : []),
        { label: 'Retailer shipping', value: l.retailerShipping },
        { label: `Sales tax (${(l.taxRate * 100).toFixed(1)}%)`, value: l.taxFee, note: 'Resale-certificate state' },
        { label: 'Amazon referral fee', value: l.referralFee, note: `${((l.referralFee / Math.max(l.buyBox, 0.01)) * 100).toFixed(0)}% of buy box` },
        { label: 'FBA fulfillment', value: l.fbaFee, note: SIZE_TIER_LABEL[l.sizeTier] ?? l.sizeTier },
        { label: 'Monthly storage (30d)', value: l.storageFee },
        { label: 'Inbound shipping', value: l.inboundFee },
        { label: 'Prep', value: l.prepFee, note: li?.fragile ? 'Fragile handling' : undefined },
      ]
    : [];

  return (
    <Sheet open={!!selectedLeadId} onOpenChange={(o) => !o && close()}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl md:max-w-2xl" side="right">
        <SheetTitle className="sr-only">Lead detail</SheetTitle>
        {loading || !detail || !l || !li || !m ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading lead…</div>
        ) : (
          <div className="flex flex-col">
            <SheetHeader className="space-y-0 border-b border-slate-100 p-4 pb-4 text-left sm:p-5">
              <div className="flex flex-wrap items-start gap-3">
                <ProductImage imageKey={l.imageUrl} title={l.title} category={l.category} className="h-12 w-12 rounded-lg text-sm sm:h-16 sm:w-16 sm:text-base" />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold leading-snug text-slate-900">{l.title}</p>
                  <SheetDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className="font-semibold text-slate-600">{l.brand}</span>
                    <span>· {l.category}</span>
                    <span>· ASIN {l.asin}</span>
                    <MatchBadge method={m.method} confidence={m.confidence} flagged={m.flagged} />
                  </SheetDescription>
                  <ScanChips scans={detail.scans} max={4} className="mt-1.5" />
                </div>
                {detail.buyUrl && (
                  <Button size="sm" className="h-8 w-full gap-1 bg-emerald-600 text-[11px] hover:bg-emerald-500 sm:w-auto" onClick={() => window.open(detail.buyUrl, '_blank', 'noopener')}>
                    <ExternalLink className="h-3 w-3" /> Buy at {l.retailerName}
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-8 w-full gap-1 text-[11px] sm:w-auto" asChild={false} onClick={() => window.open(`https://www.amazon.com/dp/${l.asin}`, '_blank')}>
                  <ExternalLink className="h-3 w-3" /> Amazon
                </Button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <p className="text-[10px] font-medium text-slate-500">Retail price</p>
                  <p className="font-mono text-sm font-bold tabular-nums text-slate-900">${l.retailerPrice.toFixed(2)}</p>
                  {l.discountPct > 0 && <p className="font-mono text-[10px] text-slate-400"><s>${l.listPrice.toFixed(2)}</s> −{l.discountPct.toFixed(0)}%</p>}
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <p className="text-[10px] font-medium text-slate-500">Amazon buy box</p>
                  <p className="font-mono text-sm font-bold tabular-nums text-slate-900">${l.buyBox.toFixed(2)}</p>
                  <p className="text-[10px] text-slate-400">30d avg ${li.keepa30Avg.toFixed(2)}</p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-2.5">
                  <p className="text-[10px] font-medium text-emerald-700">Net profit / unit</p>
                  <ProfitText value={l.netProfit} />
                  <p className="text-[10px] text-emerald-600/70">{l.marginPct.toFixed(0)}% margin</p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-2.5">
                  <p className="text-[10px] font-medium text-emerald-700">ROI</p>
                  <RoiBadge roi={l.roiPct} />
                  <p className="mt-0.5 text-[10px] text-emerald-600/70">breakeven ${l.breakeven.toFixed(2)}</p>
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-5 p-3 sm:p-5">
              {/* risk flags */}
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Risk flags (FR-4.2)</h3>
                {l.riskFlagList.length === 0 ? (
                  <p className="flex items-center gap-1.5 text-xs text-emerald-700">
                    <Info className="h-3.5 w-3.5" /> No risk flags on this lead.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {l.riskFlagList.map((f) => {
                      const meta = RISK_FLAG_META[f];
                      if (!meta) return null;
                      return (
                        <div key={f} className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              'mt-0.5 shrink-0 px-1.5 py-0 text-[10px]',
                              meta.severity === 'high' && 'border-red-300 bg-red-50 text-red-700',
                              meta.severity === 'medium' && 'border-amber-300 bg-amber-50 text-amber-700',
                              meta.severity === 'low' && 'border-stone-300 text-stone-600'
                            )}
                          >
                            {meta.label}
                          </Badge>
                          <p className="text-xs leading-snug text-slate-600">{meta.desc}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* fee breakdown */}
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Fee breakdown — net profit math (FR-3.1)</h3>
                <div className="overflow-hidden rounded-lg border border-slate-100">
                  <table className="w-full text-xs">
                    <tbody>
                      {feeRows.map((r, i) => (
                        <tr key={r.label} className={cn('border-b border-slate-50', i % 2 === 1 && 'bg-slate-50/50')}>
                          <td className="px-2 py-2 text-slate-600 sm:px-3 sm:py-1.5">
                            {r.label}
                            {r.note && <span className="mt-0.5 block text-[10px] text-slate-400 sm:ml-1.5 sm:inline">{r.note}</span>}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-700">
                            {r.value < 0 ? '−' : ''}${Math.abs(r.value).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-b border-slate-100 bg-slate-100/70">
                        <td className="px-3 py-1.5 font-semibold text-slate-700">Total landed + Amazon costs</td>
                        <td className="px-3 py-1.5 text-right font-mono font-semibold tabular-nums text-slate-800">${l.totalCost.toFixed(2)}</td>
                      </tr>
                      <tr className="bg-emerald-50">
                        <td className="px-3 py-2 font-bold text-emerald-800">Net profit (buy box ${l.buyBox.toFixed(2)})</td>
                        <td className="px-3 py-2 text-right">
                          <ProfitText value={l.netProfit} />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  Breakeven ${l.breakeven.toFixed(2)} — the minimum buy box that still hits your {Math.round(((l.buyBox - l.totalCost) / Math.max(l.retailerPrice + l.retailerShipping + l.taxFee, 0.01)) * 100) >= 0 ? 'ROI floor' : 'ROI floor'} (FR-3.5).
                </p>
              </section>

              {/* price history */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">90-day buy box history (Keepa)</h3>
                  <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    Stability {(li.priceStability * 100).toFixed(0)}%
                    {li.rankTrend === 'up' ? <TrendingUp className="h-3 w-3 text-emerald-500" /> : li.rankTrend === 'down' ? <TrendingDown className="h-3 w-3 text-red-400" /> : <Minus className="h-3 w-3 text-slate-400" />}
                  </span>
                </div>
                <div className="h-44 rounded-lg border border-slate-100 p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={li.history} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="d" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={14} />
                      <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} domain={['auto', 'auto']} tickFormatter={(v: number) => `$${v}`} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v: number) => [`$${v.toFixed(2)}`, 'Buy box']} />
                      <ReferenceLine y={l.breakeven} stroke="#d97706" strokeDasharray="4 4" label={{ value: 'breakeven', fontSize: 9, fill: '#d97706', position: 'insideBottomRight' }} />
                      <Line type="monotone" dataKey="p" stroke="#059669" strokeWidth={1.8} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Dashed line: your breakeven price. Buy box below it = deal still viable after all fees.</p>
              </section>

              {/* marketplace snapshot */}
              <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-slate-100 p-2.5">
                  <p className="text-[10px] text-slate-500">BSR</p>
                  <p className="font-mono text-sm font-semibold tabular-nums text-slate-800">{li.bsr.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border border-slate-100 p-2.5">
                  <p className="text-[10px] text-slate-500">FBA / FBM offers</p>
                  <p className="font-mono text-sm font-semibold tabular-nums text-slate-800">
                    {li.fbaOffers} / {li.fbmOffers}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 p-2.5">
                  <p className="text-[10px] text-slate-500">Size tier</p>
                  <p className="text-xs font-semibold text-slate-800">{SIZE_TIER_LABEL[li.sizeTier] ?? li.sizeTier}</p>
                  <p className="text-[10px] text-slate-400">{li.weightLb.toFixed(1)} lb</p>
                </div>
                <div className="rounded-lg border border-slate-100 p-2.5">
                  <p className="text-[10px] text-slate-500">Match provenance</p>
                  <p className="text-xs font-semibold text-slate-800">{m.method === 'GTIN' ? 'GTIN exact' : `Fuzzy ${(m.confidence * 100).toFixed(0)}%`}</p>
                  <p className="text-[10px] text-slate-400">
                    {m.packCount}×{m.unitSize}
                  </p>
                </div>
              </section>

              {/* actions */}
              <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {detail.pipeline ? (
                    <>
                      <Select value={status} onValueChange={(v) => { setStatus(v); saveToPipeline(v); }} disabled={busy}>
                        <SelectTrigger className="h-8 w-40 bg-white text-xs">
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
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => saveToPipeline()} disabled={busy}>
                        Update status
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" className="h-8 gap-1.5 bg-emerald-600 text-xs hover:bg-emerald-500" onClick={() => saveToPipeline('NEW')} disabled={busy}>
                      <Star className="h-3.5 w-3.5" /> Save to pipeline
                    </Button>
                  )}

                  <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={flagMatch} disabled={busy || m.flagged}>
                    <ShieldAlert className={cn('h-3.5 w-3.5', m.flagged && 'text-red-500')} />
                    {m.flagged ? 'Flagged for review' : 'Flag bad match'}
                  </Button>

                  <span className="flex w-full items-center gap-2 text-[11px] text-slate-400 sm:ml-auto sm:w-auto">
                    <FreshnessDot fresh={l.fresh} ageH={l.priceAgeH} tier={l.retailerTier} />
                    <span>· {detail.retailer.domain}</span>
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Verified on the live page via the browser extension (FR-6.1/6.2) · last price check {new Date(l.lastVerifiedAt).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })}
                </p>
              </section>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
