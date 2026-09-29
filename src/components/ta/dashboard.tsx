'use client';

// Dashboard — success metrics (PRD §4): North Star, match precision, price
// freshness, scan coverage + lead flow charts, top opportunities, activity.

import { useCallback, useEffect, useState } from 'react';
import { api, type DashboardDTO } from '@/lib/ta/api';
import { useTAStore } from './store';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { ProductImage } from './product-image';
import { RiskFlagChips, ProfitText, RoiBadge, ScanChips } from './badges';
import { AreaChart, BarChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Target, TrendingUp, ShieldCheck, RefreshCw, Radar, Store, Activity, Zap, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function KpiCard(props: { label: string; value: string; sub?: string; icon: React.ReactNode; tone?: string; progress?: number }) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">{props.label}</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900">{props.value}</p>
            {props.sub && <p className="mt-0.5 text-[11px] text-slate-500">{props.sub}</p>}
          </div>
          <div className={cn('rounded-lg p-2', props.tone ?? 'bg-emerald-50 text-emerald-600')}>{props.icon}</div>
        </div>
        {props.progress != null && <Progress value={props.progress} className="mt-3 h-1.5" />}
      </CardContent>
    </Card>
  );
}

export function DashboardView() {
  const [data, setData] = useState<DashboardDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const { setView, openLead, bumpDealRefresh, dealRefreshKey, bootstrap } = useTAStore();
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setData(await api.dashboard());
    } catch (e) {
      toast({ title: 'Dashboard failed to load', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load, dealRefreshKey, bootstrap]);

  if (loading || !data) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  const k = data.kpis;
  const northStarPct = Math.min(100, (k.northStar.value / k.northStar.target) * 100);

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="North Star — leads acted on / wk"
          value={`${k.northStar.value}`}
          sub={`Target ≥ ${k.northStar.target} · saved, exported or purchased`}
          icon={<Target className="h-5 w-5" />}
          progress={northStarPct}
        />
        <KpiCard
          label="New leads today"
          value={`${k.leadsToday}`}
          sub={`${k.leads7d} in the last 7 days`}
          icon={<Zap className="h-5 w-5" />}
          tone="bg-amber-50 text-amber-600"
        />
        <KpiCard
          label="Match precision"
          value={`${k.matchPrecision}%`}
          sub="Clean auto-accepted ASIN matches (target ≥95%)"
          icon={<ShieldCheck className="h-5 w-5" />}
          tone="bg-teal-50 text-teal-600"
        />
        <KpiCard
          label="Price freshness"
          value={`${k.priceFreshness}%`}
          sub={`Scan coverage ${k.scanCoverage}% · ${k.healthySites}/${k.totalSites} sites healthy`}
          icon={<RefreshCw className="h-5 w-5" />}
          tone="bg-lime-50 text-lime-600"
        />
      </div>

      {/* charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-slate-200 shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">Lead discovery — last 14 days</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.leadsPerDay} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="leadFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#059669" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#059669" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} interval={2} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  formatter={(v) => [`${v} leads`, 'Discovered']}
                />
                <Area type="monotone" dataKey="n" stroke="#059669" strokeWidth={2} fill="url(#leadFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">ROI distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.roiBuckets} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} formatter={(v) => [`${v} leads`, 'ROI band']} />
                <Bar dataKey="n" radius={[4, 4, 0, 0]} fill="#0d9488" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* opportunities + side panels */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-slate-200 shadow-sm lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700">Top opportunities by deal score</CardTitle>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setView('deals')}>
              Open Deal Finder
            </Button>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {data.topOpportunities.map((l) => (
              <button
                key={l.id}
                onClick={() => openLead(l.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-transparent p-2 text-left transition-colors hover:border-slate-200 hover:bg-slate-50"
              >
                <ProductImage imageKey={l.imageUrl} title={l.title} category={l.category} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{l.title}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                    <span>{l.retailerName}</span>
                    <span>·</span>
                    <span className="font-mono">${l.retailerPrice.toFixed(2)} → ${l.buyBox.toFixed(2)}</span>
                    <RiskFlagChips flags={l.riskFlags} max={2} />
                  </div>
                  <ScanChips scans={l.scans} max={2} className="mt-1" />
                </div>
                <div className="text-right">
                  <ProfitText value={l.netProfit} />
                  <div className="mt-0.5">
                    <RoiBadge roi={l.roiPct} />
                  </div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex-row items-center gap-2 pb-2">
              <Store className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-sm font-semibold text-slate-700">Scan health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.recentJobs.slice(0, 5).map((j) => (
                <div key={j.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Badge variant="outline" className="px-1 py-0 text-[9px] font-bold text-slate-500">
                      {j.tier}
                    </Badge>
                    <span className="truncate text-slate-700">{j.retailer}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {j.newLeads > 0 && <span className="font-semibold text-emerald-700">+{j.newLeads}</span>}
                    {j.status === 'DONE' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                    )}
                  </span>
                </div>
              ))}
              <Button size="sm" variant="ghost" className="h-7 w-full text-xs text-slate-500" onClick={() => setView('retailers')}>
                All retailers →
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex-row items-center gap-2 pb-2">
              <Activity className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-sm font-semibold text-slate-700">Activity</CardTitle>
            </CardHeader>
            <CardContent className="max-h-64 space-y-2.5 overflow-y-auto">
              {data.activity.map((a) => (
                <div key={a.id} className="flex gap-2 text-xs">
                  <TrendingUp className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                  <div>
                    <p className="leading-snug text-slate-600">{a.message}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {new Date(a.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
