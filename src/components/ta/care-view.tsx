'use client';

// Care Console (PRD TA-PRD-CARE-1.0 §6): agent queue + Ticket 360 dashboard.
// Everything the platform knows about the customer and their query is
// assembled server-side (GET /api/care/tickets/[id]) and shown on one screen.

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type CareQueueDTO, type CareQueueRow, type Ticket360DTO } from '@/lib/ta/api';
import { useTAStore } from './store';
import { useToast } from '@/hooks/use-toast';
import { RiskFlagChips } from './badges';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft, BrainCircuit, ChevronRight, CircleDollarSign, Clock, Headset,
  MessageSquare, Package, Paperclip, Radar, ShieldCheck, ShoppingBag, Star, Store, UserRound, Zap,
} from 'lucide-react';

const CATEGORY_CHIP: Record<string, string> = {
  BILLING: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  DATA_QUALITY: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  CONNECTOR: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  AI_QUALITY: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  ACCOUNT: 'border-border bg-stone-500/10 text-foreground/80',
  SHOPPING: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  FEATURE: 'border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400',
  OTHER: 'border-border text-muted-foreground',
};

const STATUS_CHIP: Record<string, string> = {
  OPEN: 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  IN_PROGRESS: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  WAITING_CUSTOMER: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  RESOLVED: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  CLOSED: 'border-border text-muted-foreground',
};

const PRIORITY_CHIP: Record<string, string> = {
  P1: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400',
  P2: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  P3: 'border-border text-muted-foreground',
};

function slaChip(sla: CareQueueRow['sla']) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 px-1.5 text-[10px]',
        sla.kind === 'breach' && 'border-red-500/40 bg-red-500/10 text-red-500',
        sla.kind === 'warn' && 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
        sla.kind === 'ok' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        sla.kind === 'done' && 'border-border text-muted-foreground',
      )}
    >
      <Clock className="h-2.5 w-2.5" /> {sla.label}
    </Badge>
  );
}

function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function verdictBadge(verdict: string) {
  const cls =
    verdict === 'BUY_NOW'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      : verdict === 'WAIT'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
        : 'border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400';
  return <Badge variant="outline" className={cn('px-1 text-[9px]', cls)}>{verdict.replace('_', ' ')}</Badge>;
}

export function CareView() {
  const { toast } = useToast();
  const openLead = useTAStore((s) => s.openLead);
  const [queue, setQueue] = useState<CareQueueDTO | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Ticket360DTO | null>(null);
  const [filters, setFilters] = useState({ status: 'ALL', category: 'ALL', priority: 'ALL', customerType: 'ALL', q: '' });
  const [mobileDetail, setMobileDetail] = useState(false);

  const loadQueue = useCallback(async () => {
    const q = await api.careTickets(filters);
    setQueue(q);
    return q;
  }, [filters]);

  const loadDetail = useCallback(async (id: string) => {
    setDetail(await api.ticket360(id));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = await api.careTickets(filters);
        if (cancelled) return;
        setQueue(q);
        if (!selectedId && q.tickets.length) setSelectedId(q.tickets[0].id);
      } catch (e) {
        if (!cancelled) toast({ title: 'Could not load care queue', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await api.ticket360(selectedId);
        if (!cancelled) setDetail(d);
      } catch (e) {
        if (!cancelled) toast({ title: 'Could not load ticket', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const refreshAll = async () => {
    await loadQueue();
    if (selectedId) await loadDetail(selectedId);
  };

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 md:px-6 md:py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold md:text-xl">
            <Headset className="h-5 w-5 text-emerald-500" /> Care Console
          </h1>
          <p className="text-xs text-muted-foreground">Customer Care Portal per PRD TA-PRD-CARE-1.0 — queue, SLA timers, Ticket 360.</p>
        </div>
        {queue && (
          <div className="hidden gap-1.5 md:flex">
            <Badge variant="outline" className="text-[10px]">{queue.counts.open} open</Badge>
            <Badge variant="outline" className="text-[10px]">{queue.counts.inProgress} active</Badge>
            <Badge variant="outline" className="text-[10px]">{queue.counts.waiting} waiting</Badge>
            {queue.counts.breached > 0 && (
              <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-[10px] text-red-500">{queue.counts.breached} breached</Badge>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* Queue pane */}
        <div className={cn(mobileDetail && 'hidden lg:block')}>
          <div className="mb-2 space-y-2">
            <Input
              placeholder="Search ref or subject…"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              className="h-9"
              aria-label="Search tickets"
            />
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
                <SelectTrigger className="h-8 text-xs" aria-label="Filter by status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All status</SelectItem>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                  <SelectItem value="WAITING_CUSTOMER">Waiting</SelectItem>
                  <SelectItem value="RESOLVED">Resolved</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.category} onValueChange={(v) => setFilters((f) => ({ ...f, category: v }))}>
                <SelectTrigger className="h-8 text-xs" aria-label="Filter by category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All cats</SelectItem>
                  {Object.keys(CATEGORY_CHIP).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.priority} onValueChange={(v) => setFilters((f) => ({ ...f, priority: v }))}>
                <SelectTrigger className="h-8 text-xs" aria-label="Filter by priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All prio</SelectItem>
                  <SelectItem value="P1">P1</SelectItem>
                  <SelectItem value="P2">P2</SelectItem>
                  <SelectItem value="P3">P3</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.customerType} onValueChange={(v) => setFilters((f) => ({ ...f, customerType: v }))}>
                <SelectTrigger className="h-8 text-xs" aria-label="Filter by customer type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All customers</SelectItem>
                  <SelectItem value="ARBITRAGE">Arbitrage</SelectItem>
                  <SelectItem value="CONSUMER">BuyWise shoppers</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="max-h-[70vh] space-y-1.5 overflow-y-auto pr-0.5">
            {(queue?.tickets ?? []).map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedId(t.id);
                  setMobileDetail(true);
                }}
                className={cn(
                  'w-full rounded-lg border p-2.5 text-left transition-colors hover:bg-accent',
                  selectedId === t.id && 'border-emerald-500/50 bg-emerald-500/5',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-muted-foreground">{t.ref}</span>
                  <Badge variant="outline" className={cn('px-1 text-[9px]', PRIORITY_CHIP[t.priority])}>{t.priority}</Badge>
                  <Badge variant="outline" className={cn('px-1 text-[9px]', CATEGORY_CHIP[t.category])}>{t.category}</Badge>
                  {t.customerType === 'CONSUMER' && (
                    <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 px-1 text-[9px] text-emerald-600 dark:text-emerald-400">
                      <ShoppingBag className="mr-0.5 h-2.5 w-2.5" /> SHOP
                    </Badge>
                  )}
                  {(t.hasLead || t.hasRetailer || t.hasSearch) && <Paperclip className="ml-auto h-3 w-3 text-muted-foreground" />}
                </div>
                <p className="mt-1 line-clamp-2 text-sm font-medium leading-tight">{t.subject}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <Badge variant="outline" className={cn('px-1 text-[9px]', STATUS_CHIP[t.status])}>{t.status.replace('_', ' ')}</Badge>
                  {slaChip(t.sla)}
                  <span className="ml-auto text-[10px] text-muted-foreground">{ago(t.updatedAt)}</span>
                </div>
              </button>
            ))}
            {queue && queue.tickets.length === 0 && (
              <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">No tickets match these filters.</p>
            )}
          </div>
        </div>

        {/* 360 pane */}
        <div className={cn(!mobileDetail && 'hidden lg:block')}>
          {!detail && <p className="p-6 text-sm text-muted-foreground">Select a ticket to open its 360 dashboard.</p>}
          {detail && (
            <Ticket360Panel
              data={detail}
              onBack={() => setMobileDetail(false)}
              onChanged={refreshAll}
              onOpenDeal={(leadId) => {
                openLead(leadId);
                setMobileDetail(false);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ticket 360 dashboard (PRD Table 6-1) ──
function Ticket360Panel({
  data, onBack, onChanged, onOpenDeal,
}: {
  data: Ticket360DTO;
  onBack: () => void;
  onChanged: () => Promise<void>;
  onOpenDeal: (leadId: string) => void;
}) {
  const { toast } = useToast();
  const t = data.ticket;
  const isConsumer = data.consumer != null;
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [cannedOpen, setCannedOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const patch = async (body: Record<string, unknown>, okMsg: string) => {
    try {
      await api.updateTicket(t.id, body);
      toast({ title: okMsg });
      await onChanged();
    } catch (e) {
      toast({ title: 'Update blocked', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const send = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await api.replyTicket(t.id, { body: reply, internal });
      setReply('');
      setCannedOpen(false);
      await onChanged();
    } catch (e) {
      toast({ title: 'Could not send', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground lg:hidden" onClick={onBack}>
        <ArrowLeft className="h-3.5 w-3.5" /> Queue
      </Button>

      {/* Header + workflow controls */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-muted-foreground">{t.ref}</span>
            <Badge variant="outline" className={cn('px-1.5 text-[10px]', PRIORITY_CHIP[t.priority])}>{t.priority}</Badge>
            <Badge variant="outline" className={cn('px-1.5 text-[10px]', CATEGORY_CHIP[t.category])}>{t.category}</Badge>
            <span className="ml-auto text-[11px] text-muted-foreground">opened {ago(t.createdAt)} ago · updated {ago(t.updatedAt)} ago</span>
          </div>
          <CardTitle className="text-base leading-snug">{t.subject}</CardTitle>
          {data.sla.kind !== 'done' && <div className="pt-1">{slaChip(data.sla)}</div>}
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Status</Label>
            <Select value={t.status} onValueChange={(v) => patch({ status: v }, `Status → ${v}`)}>
              <SelectTrigger className="h-8 text-xs" aria-label="Ticket status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="OPEN">OPEN</SelectItem>
                <SelectItem value="IN_PROGRESS">IN_PROGRESS</SelectItem>
                <SelectItem value="WAITING_CUSTOMER">WAITING_CUSTOMER</SelectItem>
                <SelectItem value="RESOLVED">RESOLVED</SelectItem>
                <SelectItem value="CLOSED">CLOSED</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Priority</Label>
            <Select value={t.priority} onValueChange={(v) => patch({ priority: v }, `Priority → ${v}`)}>
              <SelectTrigger className="h-8 text-xs" aria-label="Ticket priority"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="P1">P1</SelectItem>
                <SelectItem value="P2">P2</SelectItem>
                <SelectItem value="P3">P3</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Assignee</Label>
            <Select value={t.assignee ?? 'unassigned'} onValueChange={(v) => patch({ assignee: v === 'unassigned' ? '' : v }, 'Assignment updated')}>
              <SelectTrigger className="h-8 text-xs" aria-label="Assignee"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                <SelectItem value="Dana (Care)">Dana (Care)</SelectItem>
                <SelectItem value="Leo (Care Lead)">Leo (Care Lead)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Customer</Label>
            <p className="flex h-8 items-center gap-1.5 text-sm font-medium"><UserRound className="h-3.5 w-3.5 text-muted-foreground" /> {data.customer.name}</p>
          </div>
        </CardContent>
      </Card>

      {/* Customer profile + footprint (type-aware §9.2: arbitrage usage vs BuyWise shopping) */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Customer profile</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {isConsumer ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400">
                    <ShoppingBag className="mr-1 h-3 w-3" /> BuyWise shopper
                  </Badge>
                </div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Email</span><span className="min-w-0 truncate font-medium">{data.consumer?.email || '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Customer since</span><span>{new Date(data.consumer?.shopperSince ?? t.createdAt).toLocaleDateString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Analyses run</span><span>{data.consumer?.searchCount ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Price watches</span><span>{data.consumer?.watchCount ?? 0}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Last verdict</span><span className="font-medium">{data.consumer?.lastVerdict ? data.consumer.lastVerdict.replace('_', ' ') : '—'}</span></div>
              </>
            ) : (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span className="font-medium">{data.customer.plan} · ${data.customer.planPrice}/mo</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Billing</span><span>{data.customer.billingCycle}{data.customer.trialEndsAt ? ` · trial ends ${new Date(data.customer.trialEndsAt).toLocaleDateString()}` : ''}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Marketplace</span><span>Amazon {data.customer.marketplace}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Sourcing</span><span>{data.customer.sourcingState} (tax-free)</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Onboarded</span><span>{data.customer.onboarded ? 'yes' : 'no'}</span></div>
                {data.customer.health && (
                  <div className="flex items-center justify-between border-t pt-1.5">
                    <span className="flex items-center gap-1 text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Account health</span>
                    <Badge variant="outline" className={cn('text-[10px]', data.customer.health.score >= 70 ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'border-amber-500/30 text-amber-600 dark:text-amber-400')}>
                      {data.customer.health.score}/100 · {data.customer.health.band}
                    </Badge>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
        {!isConsumer && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Usage footprint</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <div className="flex items-center gap-1.5"><RadarIcon className="h-3.5 w-3.5 text-muted-foreground" /> {data.usage.totalLeads.toLocaleString()} leads ({data.usage.freshLeads} fresh)</div>
              <div className="flex items-center gap-1.5"><Store className="h-3.5 w-3.5 text-muted-foreground" /> {data.usage.scansets} saved scans</div>
              <div className="flex items-center gap-1.5"><Package className="h-3.5 w-3.5 text-muted-foreground" /> pipeline: {data.usage.pipeline.NEW} new · {data.usage.pipeline.PURCHASED} bought</div>
              <div className="flex items-center gap-1.5"><CircleDollarSign className="h-3.5 w-3.5 text-muted-foreground" /> {data.usage.pipeline.WON} won · {data.usage.pipeline.LOST} lost</div>
              <div className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-muted-foreground" /> {data.usage.outcomesLogged} outcomes logged</div>
              <div className="flex items-center gap-1.5"><BrainCircuit className="h-3.5 w-3.5 text-muted-foreground" /> AI win rate {data.usage.winRate != null ? `${data.usage.winRate}%` : '—'}</div>
            </CardContent>
          </Card>
        )}
        {isConsumer && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Shopping footprint</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {(data.consumer?.searches ?? []).slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center gap-2 border-b pb-1.5 last:border-0 last:pb-0">
                  {verdictBadge(s.verdict)}
                  <span className="min-w-0 flex-1 truncate text-xs">{s.productName}</span>
                  <span className="shrink-0 text-xs font-semibold">${s.bestTotal.toFixed(2)}</span>
                </div>
              ))}
              {(!data.consumer || data.consumer.searches.length === 0) && <p className="text-xs text-muted-foreground">No analyses on record for this shopper.</p>}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Referenced entity */}
      {data.referenced.lead && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm"><Paperclip className="h-4 w-4 text-muted-foreground" /> Referenced deal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="font-mono text-[10px]">{data.referenced.lead.asin}</Badge>
              <span className="min-w-0 flex-1 truncate font-medium">{data.referenced.lead.title}</span>
              <Badge variant="outline" className={cn('text-[10px]', data.referenced.lead.fresh ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'border-amber-500/30 text-amber-600 dark:text-amber-400')}>
                {data.referenced.lead.fresh ? 'fresh' : `stale ${data.referenced.lead.priceAgeH.toFixed(0)}h`}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {data.referenced.lead.retailerName} · {data.referenced.lead.brand} · {data.referenced.lead.category} · BSR {data.referenced.lead.bsr.toLocaleString()}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border p-2.5 text-sm sm:grid-cols-4">
              <div><p className="text-[10px] text-muted-foreground">Retailer price</p><p className="font-semibold">${data.referenced.lead.retailerPrice.toFixed(2)}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Landed cost</p><p className="font-semibold">${data.referenced.lead.totalCost.toFixed(2)}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Net profit</p><p className="font-semibold">${data.referenced.lead.netProfit.toFixed(2)}</p></div>
              <div><p className="text-[10px] text-muted-foreground">ROI / margin</p><p className="font-semibold">{data.referenced.lead.roiPct.toFixed(0)}% / {data.referenced.lead.marginPct.toFixed(0)}%</p></div>
              <div><p className="text-[10px] text-muted-foreground">Breakeven</p><p className="font-semibold">${data.referenced.lead.breakeven.toFixed(2)}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Buy box</p><p className="font-semibold">${data.referenced.lead.buyBox.toFixed(2)}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Deal score</p><p className="font-semibold">{Math.round(data.referenced.lead.score)}</p></div>
              <div><p className="text-[10px] text-muted-foreground">90d range</p><p className="font-semibold">
                ${Math.min(...data.referenced.lead.history.map((h) => h.p)).toFixed(2)}–${Math.max(...data.referenced.lead.history.map((h) => h.p)).toFixed(2)}
              </p></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <RiskFlagChips flags={data.referenced.lead.riskFlags} />
              <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => onOpenDeal(data.referenced.lead!.id)}>
                Open in Deal Finder <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {data.referenced.retailer && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm"><Paperclip className="h-4 w-4 text-muted-foreground" /> Referenced retailer</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <div><p className="text-[10px] text-muted-foreground">Retailer</p><p className="font-semibold">{data.referenced.retailer.name}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Tier</p><p className="font-semibold">{data.referenced.retailer.tier}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Status</p><p className="font-semibold capitalize">{data.referenced.retailer.status}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Coverage</p><p className="font-semibold">{data.referenced.retailer.coverage}% @ {data.referenced.retailer.cadenceHours}h</p></div>
          </CardContent>
        </Card>
      )}

      {/* Referenced BuyWise comparison — what the customer saw (§9.2) */}
      {data.consumer?.referencedSearch && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShoppingBag className="h-4 w-4 text-emerald-500" /> Referenced comparison — exactly what the customer saw
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {verdictBadge(data.consumer.referencedSearch.verdict)}
              <Badge variant="outline" className="text-[10px]">{Math.round(data.consumer.referencedSearch.confidence)}% confidence</Badge>
              <span className="min-w-0 flex-1 truncate font-medium">{data.consumer.referencedSearch.productName}</span>
              <Badge variant="outline" className="text-[10px]">fair-price {Math.round(data.consumer.referencedSearch.fairPercentile)}th pctile</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {data.consumer.referencedSearch.brand} · {data.consumer.referencedSearch.category} · analyzed {new Date(data.consumer.referencedSearch.createdAt).toLocaleDateString()} · engine {data.consumer.referencedSearch.engineLabel} · 90d range ${data.consumer.referencedSearch.priceLow90.toFixed(2)}–${data.consumer.referencedSearch.priceHigh90.toFixed(2)}
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-2.5 py-1.5">Vendor</th>
                    <th className="px-2.5 py-1.5">Total</th>
                    <th className="px-2.5 py-1.5">Ship + tax</th>
                    <th className="px-2.5 py-1.5">ETA</th>
                    <th className="px-2.5 py-1.5">Rating</th>
                    <th className="px-2.5 py-1.5">Badges</th>
                  </tr>
                </thead>
                <tbody>
                  {data.consumer.referencedSearch.quotes.map((q) => (
                    <tr key={q.vendor} className={cn('border-b last:border-0', !q.inStock && 'opacity-50')}>
                      <td className="px-2.5 py-1.5 font-medium">{q.vendor}{!q.inStock && <span className="ml-1 text-[9px] text-red-500">OOS</span>}</td>
                      <td className="px-2.5 py-1.5 font-bold">${q.total.toFixed(2)}</td>
                      <td className="px-2.5 py-1.5">${q.shipping.toFixed(2)} + ${q.tax.toFixed(2)}</td>
                      <td className="px-2.5 py-1.5">{q.etaDays}d</td>
                      <td className="px-2.5 py-1.5">{q.rating.toFixed(1)}★</td>
                      <td className="px-2.5 py-1.5 text-muted-foreground">{q.badges.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="rounded-lg bg-muted/40 p-2.5 text-xs italic text-muted-foreground">“{data.consumer.referencedSearch.narrative}”</p>
          </CardContent>
        </Card>
      )}

      {/* Past tickets */}
      {data.pastTickets.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">History with this customer</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {data.pastTickets.slice(0, 4).map((p) => (
              <div key={p.id} className="flex items-center gap-2 border-b py-1.5 text-sm last:border-0">
                <span className="font-mono text-[10px] text-muted-foreground">{p.ref}</span>
                <span className="min-w-0 flex-1 truncate">{p.subject}</span>
                {p.csat != null && <span className="flex items-center gap-0.5 text-[10px] text-amber-500"><Star className="h-3 w-3 fill-amber-500" /> {p.csat}</span>}
                <Badge variant="outline" className={cn('px-1 text-[9px]', STATUS_CHIP[p.status])}>{p.status.replace('_', ' ')}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Thread */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><MessageSquare className="h-4 w-4" /> Conversation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div ref={threadRef} className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {data.messages.map((m) => (
              <div key={m.id} className={cn('max-w-[85%] rounded-lg border p-2.5 text-sm', m.authorRole === 'CUSTOMER' ? 'mr-auto' : 'ml-auto bg-accent', m.internal && 'border-amber-500/40 bg-amber-500/10')}>
                <div className="mb-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="font-semibold text-foreground">{m.author}</span>
                  {m.internal && <Badge variant="outline" className="border-amber-500/40 px-1 text-[9px] text-amber-600 dark:text-amber-400">internal note</Badge>}
                  <span>{ago(m.createdAt)} ago</span>
                </div>
                {m.body}
              </div>
            ))}
          </div>

          {cannedOpen && (
            <div className="space-y-1 rounded-lg border p-2">
              <p className="text-[10px] font-semibold text-muted-foreground">Canned responses — insert to edit</p>
              {data.canned.map((c) => (
                <button
                  key={c.id}
                  className="block w-full rounded-md border p-2 text-left text-xs hover:bg-accent"
                  onClick={() => { setReply(c.body); setCannedOpen(false); }}
                >
                  <span className="font-semibold">{c.title}</span>
                  <span className="line-clamp-1 text-muted-foreground"> — {c.body}</span>
                </button>
              ))}
            </div>
          )}

          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            placeholder={internal ? 'Internal note — visible to care staff only…' : 'Reply to the customer…'}
            aria-label="Message composer"
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Switch id="internal-toggle" checked={internal} onCheckedChange={setInternal} aria-label="Toggle internal note" />
              <Label htmlFor="internal-toggle" className="text-xs text-muted-foreground">Internal note</Label>
            </div>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setCannedOpen((o) => !o)}>Canned…</Button>
            <Button size="sm" className="ml-auto h-8 bg-emerald-600 text-xs hover:bg-emerald-500" onClick={send} disabled={sending || !reply.trim()}>
              Send as {internal ? 'note' : 'reply'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Timeline</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {data.events.map((e) => (
            <div key={e.id} className="flex items-baseline gap-2 border-b py-1.5 text-sm last:border-0">
              <Badge variant="outline" className="px-1.5 py-0 text-[9px] text-muted-foreground">{e.type}</Badge>
              <span className="min-w-0 flex-1 text-xs">{e.detail}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{e.actor} · {ago(e.createdAt)} ago</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function RadarIcon({ className }: { className?: string }) {
  return <Radar className={className} />;
}
