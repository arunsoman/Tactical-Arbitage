'use client';

// Deal detail (§4 US-2/US-3): single-column mobile sheet, readable at arm's
// length. Progressive disclosure — one-line reason by default, full evidence on
// tap. Sticky bottom CTA bar keeps Save / Buy / More within one-thumb reach.

import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { api, type LeadDetailDTO } from '@/lib/ta/api';
import type { PickDTO } from '@/lib/ta/ai/types';
import { fmtMoney } from '@/lib/ta/profit';
import { RISK_FLAG_META, parseJsonArray, type RiskFlag } from '@/lib/ta/types';
import { AiScoreRing, ConfidenceBadge, FactorRow, FreshnessDot } from './ai-bits';
import { OutcomeSheet, type OutcomeSheetTarget } from './outcome-sheet';
import { TrustSheet, type TrustTarget } from './trust-sheet';
import { cn } from '@/lib/utils';
import { ChevronDown, Heart, MoreHorizontal, ShieldQuestion, ShoppingCart } from 'lucide-react';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function DealDetailSheet({ pick, onClose, onSaved, onChanged }: { pick: PickDTO | null; onClose: () => void; onSaved?: () => void; onChanged?: () => void }) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<LeadDetailDTO | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showFees, setShowFees] = useState(false);
  const [outcomeTarget, setOutcomeTarget] = useState<OutcomeSheetTarget | null>(null);
  const [trustTarget, setTrustTarget] = useState<TrustTarget | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDetail(null);
    setShowEvidence(false);
    setShowFees(false);
    if (pick) {
      api.leadDetail(pick.leadId).then(setDetail).catch(() => null);
    }
  }, [pick]);

  const history = useMemo(() => detail?.listing.history ?? [], [detail]);

  if (!pick) return null;
  const lead = pick.lead;
  const flags = parseJsonArray(lead.riskFlags) as RiskFlag[];

  const save = async () => {
    setSaving(true);
    try {
      await api.saveToPipeline(lead.id);
      toast({ title: 'Saved to pipeline', description: `${lead.asin} is now in your New list.` });
      onSaved?.();
      onChanged?.();
    } catch (e) {
      toast({ title: 'Could not save', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const openBuy = () => {
    if (!detail) return;
    setOutcomeTarget({
      leadId: lead.id,
      title: lead.title,
      buyBox: detail.lead.buyBox,
      totalCost: detail.lead.totalCost,
      roiPct: lead.roiPct,
    });
  };

  const feeRows = detail
    ? ([
        ['Retailer price', detail.lead.retailerPrice],
        ['Retailer shipping', detail.lead.retailerShipping],
        ['Sales tax', detail.lead.taxFee],
        ['Referral fee', detail.lead.referralFee],
        ['FBA fulfillment', detail.lead.fbaFee],
        ['Monthly storage', detail.lead.storageFee],
        ['Inbound shipping', detail.lead.inboundFee],
        ['Prep', detail.lead.prepFee],
      ] as [string, number][])
    : [];

  return (
    <>
      <Sheet open onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="bottom" className="mx-auto flex max-h-[94dvh] w-full max-w-md flex-col rounded-t-2xl p-0">
          {/* scrollable body */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SheetHeader className="space-y-0 px-4 pb-2 pt-4 text-left">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <SheetTitle className="line-clamp-2 text-base leading-snug">{lead.title}</SheetTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {lead.retailerName} · {lead.asin} · {lead.brand} · {lead.category}
                  </p>
                </div>
                <AiScoreRing score={pick.aiScore} />
              </div>
            </SheetHeader>

            <div className="space-y-4 px-4 pb-40">
              {/* confidence + freshness */}
              <div className="flex flex-wrap items-center gap-2">
                <ConfidenceBadge confidence={pick.confidence} />
                <FreshnessDot ageH={lead.priceAgeH} fresh={lead.fresh} />
                {pick.inPipeline && <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">in pipeline</Badge>}
              </div>

              {/* key numbers */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Buy at {lead.retailerName}</p>
                  <p className="text-lg font-bold">{fmtMoney(lead.retailerPrice)}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sell (buy box)</p>
                  <p className="text-lg font-bold">{fmtMoney(lead.buyBox)}</p>
                </div>
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Net profit</p>
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(lead.netProfit)}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">ROI / margin</p>
                  <p className="text-lg font-bold">{Math.round(lead.roiPct)}% / {Math.round(lead.marginPct)}%</p>
                </div>
              </div>

              {/* progressive disclosure — one line by default (US-3) */}
              <section className="rounded-xl border border-border bg-card">
                <button type="button" className="flex w-full items-center gap-2 p-3 text-left" onClick={() => setShowEvidence((v) => !v)} aria-expanded={showEvidence}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug">
                      <span className="font-semibold">Why this pick: </span>
                      {pick.reason}
                    </p>
                  </div>
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', showEvidence && 'rotate-180')} />
                </button>
                {showEvidence && (
                  <div className="space-y-2 border-t border-border p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Evidence chain — every claim traces to data</p>
                    {pick.factors.map((f, i) => (
                      <FactorRow key={i} factor={f} />
                    ))}
                    {detail && (
                      <p className="pt-1 text-[11px] text-muted-foreground">
                        Breakeven buy box {fmtMoney(detail.lead.breakeven)} · est. ~{pick.estMonthlySales} sales/mo (BSR-derived estimate) · match method {detail.match.method} at {Math.round(detail.match.confidence * 100)}% confidence
                      </p>
                    )}
                  </div>
                )}
              </section>

              {/* risk flags */}
              {flags.length > 0 && (
                <section className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Risk flags</p>
                  {flags.map((f) => (
                    <div key={f} className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                      <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <p className="text-xs leading-snug">
                        <span className="font-semibold">{RISK_FLAG_META[f]?.label ?? f}:</span>{' '}
                        <span className="text-muted-foreground">{RISK_FLAG_META[f]?.desc ?? 'Review before buying.'}</span>
                      </p>
                    </div>
                  ))}
                </section>
              )}

              {/* fee breakdown (transparent math, never black-box) */}
              {detail && (
                <section className="rounded-xl border border-border bg-card">
                  <button type="button" className="flex w-full items-center justify-between p-3" onClick={() => setShowFees((v) => !v)} aria-expanded={showFees}>
                    <span className="text-sm font-semibold">Fee breakdown — {fmtMoney(detail.lead.totalCost)} fully landed</span>
                    <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', showFees && 'rotate-180')} />
                  </button>
                  {showFees && (
                    <dl className="border-t border-border px-3 py-2">
                      {feeRows.map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between py-1 text-sm">
                          <dt className="text-muted-foreground">{k}</dt>
                          <dd className="font-medium">{fmtMoney(v)}</dd>
                        </div>
                      ))}
                      <div className="mt-1 flex items-center justify-between border-t border-border py-1.5 text-sm font-bold">
                        <dt>Net after Amazon sell</dt>
                        <dd className="text-emerald-600 dark:text-emerald-400">{fmtMoney(detail.lead.netProfit)}</dd>
                      </div>
                    </dl>
                  )}
                </section>
              )}

              {/* 90-day price history with breakeven reference */}
              {history.length > 0 && (
                <section className="rounded-xl border border-border bg-card p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">90-day buy-box history</p>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                        <defs>
                          <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--color-emerald-500)" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="var(--color-emerald-500)" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="d" hide />
                        <YAxis hide domain={['auto', 'auto']} />
                        <Tooltip
                          contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }}
                          labelStyle={{ color: 'var(--muted-foreground)' }}
                          formatter={(v: number) => [fmtMoney(v), 'Buy box']}
                        />
                        <Area type="monotone" dataKey="p" stroke="var(--color-emerald-500)" strokeWidth={1.5} fill="url(#priceFill)" />
                        <ReferenceLine y={lead.breakeven} stroke="var(--color-amber-500)" strokeDasharray="4 4" label={{ value: 'breakeven', fill: 'var(--color-amber-500)', fontSize: 10, position: 'insideBottomRight' }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              )}
            </div>
          </div>

          {/* sticky bottom CTA bar — one-thumb reach (US-2 AC) */}
          <div className="absolute inset-x-0 bottom-0 border-t border-border bg-card/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="h-12 flex-1 border-emerald-500/50 text-emerald-600 dark:text-emerald-400"
                onClick={save}
                disabled={saving || pick.inPipeline}
              >
                <Heart className="mr-1.5 h-4 w-4" /> {pick.inPipeline ? 'Saved' : 'Save'}
              </Button>
              <Button className="h-12 flex-1 bg-emerald-600 font-semibold hover:bg-emerald-500" onClick={openBuy} disabled={!detail}>
                <ShoppingCart className="mr-1.5 h-4 w-4" /> Buy
              </Button>
              <Button variant="outline" size="icon" className="h-12 w-12" aria-label="More trust actions" onClick={() => setTrustTarget({ leadId: lead.id, brand: lead.brand, category: lead.category, retailerId: lead.retailerId, retailerName: lead.retailerName, asin: lead.asin })}>
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-muted-foreground">Buy → quick outcome log · ⋯ → dispute / suppress</p>
          </div>
        </SheetContent>
      </Sheet>

      <OutcomeSheet target={outcomeTarget} onClose={() => setOutcomeTarget(null)} onLogged={onChanged} />
      <TrustSheet target={trustTarget} onClose={() => setTrustTarget(null)} onChanged={onChanged} />
    </>
  );
}

