'use client';

// Ops & Platform Administration console (PRD TA-PRD-OPS-1.0).
// Tabs: Overview | LLM Registry | Connectors | Audit. Desktop-first internal
// console that stays usable at 768px; inherits the platform dark theme.

import { useCallback, useEffect, useState } from 'react';
import { api, type OpsOverviewDTO, type OpsLlmsDTO, type OpsConnectorsDTO } from '@/lib/ta/api';
import { CAPABILITIES, TEST_KINDS, TEST_LABELS } from '@/lib/ta/ops';
import { useToast } from '@/hooks/use-toast';
import { useTAStore } from './store';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Activity, BadgeCheck, CircleAlert, FlaskConical, Gauge, KeyRound, Plus,
  Radar, ShieldCheck, Sparkles, Store, Wrench,
} from 'lucide-react';

const STATUS_STYLE: Record<string, string> = {
  LIVE: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  CANARY: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  TESTING: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
  DRAFT: 'bg-secondary text-secondary-foreground border-border',
  PAUSED: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',
  RETIRED: 'bg-muted text-muted-foreground border-border',
};

const NEXT_STATE: Record<string, string | null> = { DRAFT: 'TESTING', TESTING: 'CANARY', CANARY: 'LIVE', PAUSED: 'LIVE' };

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h ago`;
  return `${(s / 86400).toFixed(1)}d ago`;
}

function HealthBar({ score }: { score: number }) {
  const tone = score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex min-w-24 items-center gap-2">
      <Progress value={score} className="h-1.5 w-20" />
      <span className={cn('text-xs font-semibold', score >= 80 ? 'text-emerald-600 dark:text-emerald-400' : score >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500')}>
        {score.toFixed(0)}
      </span>
      <span className="sr-only">health {score} of 100</span>
      <span className={cn('hidden h-1.5 w-0 rounded-full', tone)} />
    </div>
  );
}

export function OpsView() {
  const { toast } = useToast();
  const setView = useTAStore((s) => s.setView);
  const [tab, setTab] = useState<'overview' | 'llms' | 'connectors' | 'audit'>('overview');
  const [overview, setOverview] = useState<OpsOverviewDTO | null>(null);
  const [llms, setLlms] = useState<OpsLlmsDTO | null>(null);
  const [connectors, setConnectors] = useState<OpsConnectorsDTO | null>(null);
  const [busy, setBusy] = useState(false);

  // dialogs
  const [providerOpen, setProviderOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [connectorOpen, setConnectorOpen] = useState(false);
  const [promoteFor, setPromoteFor] = useState<{ id: string; name: string; to: string } | null>(null);
  const [gates, setGates] = useState<{ id: string; label: string; pass: boolean; detail: string }[] | null>(null);
  const [lastRun, setLastRun] = useState<{ title: string; ok: boolean; details: { check: string; pass: boolean; note: string }[] } | null>(null);

  const load = useCallback(async () => {
    const [o, l, c] = await Promise.allSettled([api.opsOverview(), api.opsLlms(), api.opsConnectors()]);
    if (o.status === 'fulfilled') setOverview(o.value);
    if (l.status === 'fulfilled') setLlms(l.value);
    if (c.status === 'fulfilled') setConnectors(c.value);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast({ title: 'Operation failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const openPromote = (c: { id: string; name: string }, to: string) =>
    withBusy(async () => {
      const preview = await api.gatePreview(c.id, to);
      setGates(preview.gates);
      setPromoteFor({ id: c.id, name: c.name, to });
    });

  const TABS = [
    { id: 'overview', label: 'Overview', icon: Gauge },
    { id: 'llms', label: 'LLM Registry', icon: Sparkles },
    { id: 'connectors', label: 'Connectors', icon: Store },
    { id: 'audit', label: 'Audit', icon: ShieldCheck },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 md:px-6 md:py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold md:text-xl">
            <Wrench className="h-5 w-5 text-emerald-500" /> Ops Console
          </h1>
          <p className="text-xs text-muted-foreground">
            Platform administration per PRD TA-PRD-OPS-1.0 — LLM registry, supplier connectors, gated go-live, audit.
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] text-muted-foreground">simulated integration environment</Badge>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border bg-card p-1" role="tablist" aria-label="Ops sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors',
              tab === t.id ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground hover:bg-accent'
            )}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab overview={overview} onOpenConnectors={() => setTab('connectors')} onOpenCare={() => setView('care')} />}
      {tab === 'llms' && (
        <LlmsTab
          llms={llms}
          busy={busy}
          onReload={load}
          withBusy={withBusy}
          onAddProvider={() => setProviderOpen(true)}
          onAddModel={() => setModelOpen(true)}
        />
      )}
      {tab === 'connectors' && (
        <ConnectorsTab
          connectors={connectors}
          busy={busy}
          withBusy={withBusy}
          onReload={load}
          onAdd={() => setConnectorOpen(true)}
          onPromote={openPromote}
          onShowRun={(title, ok, details) => setLastRun({ title, ok, details })}
        />
      )}
      {tab === 'audit' && <AuditTab overview={overview} />}

      {/* Add provider */}
      <ProviderDialog open={providerOpen} onOpenChange={setProviderOpen} onDone={() => withBusy(load)} />
      {/* Add model */}
      <ModelDialog open={modelOpen} onOpenChange={setModelOpen} llms={llms} onDone={() => withBusy(load)} />
      {/* Add connector */}
      <ConnectorDialog open={connectorOpen} onOpenChange={setConnectorOpen} connectors={connectors} onDone={() => withBusy(load)} />
      {/* Promotion checklist dialog */}
      <Dialog open={!!promoteFor} onOpenChange={(o) => !o && setPromoteFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Promote {promoteFor?.name} → {promoteFor?.to}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {(gates ?? []).map((g) => (
              <div key={g.id} className="flex items-start gap-2 rounded-lg border p-2.5">
                {g.pass ? <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}
                <div>
                  <p className="text-sm font-medium leading-tight">{g.label}</p>
                  <p className="text-xs text-muted-foreground">{g.detail}</p>
                </div>
              </div>
            ))}
            {!gates?.length && <p className="text-sm text-muted-foreground">Evaluating gates…</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoteFor(null)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-500"
              disabled={busy || !gates?.every((g) => g.pass)}
              onClick={() =>
                withBusy(async () => {
                  const res = await api.promoteConnector(promoteFor!.id, promoteFor!.to);
                  toast({ title: res.message });
                  setPromoteFor(null);
                  await load();
                })
              }
            >
              Confirm promotion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Last test-run detail dialog */}
      <Dialog open={!!lastRun} onOpenChange={(o) => !o && setLastRun(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FlaskConical className={cn('h-4 w-4', lastRun?.ok ? 'text-emerald-500' : 'text-red-500')} /> {lastRun?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            {(lastRun?.details ?? []).map((d, i) => (
              <div key={i} className="flex items-start justify-between gap-3 rounded-lg border p-2 text-sm">
                <div>
                  <p className="font-medium leading-tight">{d.check}</p>
                  <p className="text-xs text-muted-foreground">{d.note}</p>
                </div>
                <Badge variant="outline" className={d.pass ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-500'}>
                  {d.pass ? 'pass' : 'fail'}
                </Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Overview tab ──
function OverviewTab({ overview, onOpenConnectors, onOpenCare }: { overview: OpsOverviewDTO | null; onOpenConnectors: () => void; onOpenCare: () => void }) {
  if (!overview) return <p className="p-6 text-sm text-muted-foreground">Loading ops data…</p>;
  const s = overview.system;
  const kpis = [
    { label: 'Deal store', value: s.totalLeads.toLocaleString(), sub: `${s.freshPct}% fresh`, icon: Radar },
    { label: 'Rank p95', value: s.rankP95 != null ? `${s.rankP95}ms` : '—', sub: 'budget 2000ms', icon: Activity },
    { label: 'Reason p95', value: s.reasonP95 != null ? `${s.reasonP95}ms` : '—', sub: 'budget 5000ms', icon: Activity },
    { label: 'Scan success 7d', value: s.scanSuccessRate != null ? `${s.scanSuccessRate}%` : '—', sub: `${s.scanJobs7d} jobs`, icon: Gauge },
    { label: 'LLM fleet', value: `${overview.llm.enabledCount}/${overview.llm.totalCount}`, sub: overview.llm.staleTestModels.length ? `${overview.llm.staleTestModels.length} need re-test` : 'all tested', icon: Sparkles },
    { label: 'Connectors live', value: `${overview.connectors.byStatus.LIVE ?? 0}`, sub: `${overview.connectors.byStatus.CANARY ?? 0} canary · ${overview.connectors.byStatus.TESTING ?? 0} testing`, icon: Store },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label} className="p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <k.icon className="h-3 w-3" /> {k.label}
            </div>
            <p className="mt-1 text-xl font-bold leading-tight">{k.value}</p>
            <p className="truncate text-[11px] text-muted-foreground">{k.sub}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Connector SLA board</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {overview.connectors.slaBoard.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                <Badge variant="outline" className={cn('px-1.5 text-[10px]', STATUS_STYLE[c.status])}>{c.status}</Badge>
                <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                <HealthBar score={c.healthScore} />
                <span className="hidden text-[11px] text-muted-foreground sm:inline">{c.cadenceHours}h cadence</span>
              </div>
            ))}
            <Button variant="ghost" size="sm" className="mt-1 w-full text-xs text-muted-foreground" onClick={onOpenConnectors}>Manage connectors →</Button>
            {overview.system.openCareTickets > 0 && (
              <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={onOpenCare}>
                {overview.system.openCareTickets} open care ticket{overview.system.openCareTickets === 1 ? '' : 's'} →
              </Button>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Capability routing (live)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {CAPABILITIES.map((cap) => {
                const chain = overview.llm.routing[cap] ?? [];
                return (
                  <div key={cap} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="w-20 justify-center text-[10px]">{cap}</Badge>
                    {chain.length ? (
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{chain.map((m) => m.label).join(' → ')}</span>
                    ) : (
                      <span className="text-xs font-medium text-red-500">no enabled model — deterministic fallback active</span>
                    )}
                  </div>
                );
              })}
              {overview.llm.staleTestModels.length > 0 && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
                  Re-test advised: {overview.llm.staleTestModels.join(', ')} — last probe failed or is older than 7 days.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Estimated probe spend by model</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {overview.llm.spendByModel.length === 0 && <p className="text-xs text-muted-foreground">No probe spend recorded yet.</p>}
              {overview.llm.spendByModel.map((m) => (
                <div key={m.modelId} className="flex items-center justify-between text-sm">
                  <span className="truncate">{m.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">${m.spend.toFixed(4)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><Activity className="h-4 w-4" /> Recent operational activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {overview.recentActivity.map((a) => (
            <div key={a.id} className="flex items-center gap-2 border-b py-1.5 text-sm last:border-0">
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', a.ok ? 'bg-emerald-500' : 'bg-red-500')} />
              <span className="min-w-0 flex-1 truncate">{a.label}</span>
              <span className="hidden text-xs text-muted-foreground sm:inline">{a.detail}</span>
              <span className="w-16 text-right text-[11px] text-muted-foreground">{timeAgo(a.createdAt)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── LLM Registry tab ──
function LlmsTab({
  llms, busy, withBusy, onReload, onAddProvider, onAddModel,
}: {
  llms: OpsLlmsDTO | null;
  busy: boolean;
  withBusy: (fn: () => Promise<void>) => Promise<void>;
  onReload: () => Promise<void>;
  onAddProvider: () => void;
  onAddModel: () => void;
}) {
  const { toast } = useToast();
  if (!llms) return <p className="p-6 text-sm text-muted-foreground">Loading registry…</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="h-9 bg-emerald-600 hover:bg-emerald-500" onClick={onAddProvider}>
          <Plus className="h-3.5 w-3.5" /> Add provider
        </Button>
        <Button size="sm" variant="outline" className="h-9" onClick={onAddModel}>
          <Plus className="h-3.5 w-3.5" /> Enroll model
        </Button>
      </div>

      {llms.providers.map((p) => (
        <Card key={p.id}>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-sm">
                {p.name}
                <Badge variant="outline" className="text-[10px] text-muted-foreground">{p.kind}</Badge>
                {p.status === 'DISABLED' && <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-[10px] text-red-500">disabled</Badge>}
              </CardTitle>
              <p className="truncate text-xs text-muted-foreground">
                {p.models.length} model{p.models.length === 1 ? '' : 's'} · key {p.keyMasked ?? 'not captured'} {p.notes ? `· ${p.notes}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">{p.status === 'ACTIVE' ? 'Active' : 'Off'}</span>
              <Switch
                checked={p.status === 'ACTIVE'}
                disabled={busy}
                aria-label={`Toggle provider ${p.name}`}
                onCheckedChange={(v) =>
                  withBusy(async () => {
                    await api.toggleLlmProvider(p.id, v ? 'ACTIVE' : 'DISABLED');
                    toast({ title: v ? `${p.name} enabled` : `${p.name} disabled — its models are now ineligible for routing` });
                    await onReload();
                  })
                }
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {p.models.length === 0 && <p className="text-xs text-muted-foreground">No models enrolled yet.</p>}
            {p.models.map((m) => {
              const stale = !m.lastTestAt || m.lastTestStatus !== 'PASS' || Date.now() - new Date(m.lastTestAt).getTime() > 7 * 86400000;
              return (
                <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-sm">
                  <Switch
                    checked={m.enabled}
                    disabled={busy}
                    aria-label={`Toggle model ${m.label}`}
                    onCheckedChange={(v) =>
                      withBusy(async () => {
                        try {
                          await api.updateLlmModel({ id: m.id, enabled: v });
                          await onReload();
                        } catch (e) {
                          toast({ title: 'Could not update model', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
                        }
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-medium leading-tight">
                      {m.label}
                      <Badge variant="outline" className="px-1 text-[9px] text-muted-foreground">{m.tier}</Badge>
                      {m.enabled && stale && <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 px-1 text-[9px] text-amber-600 dark:text-amber-400">re-test</Badge>}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {m.modelId} · {m.contextK}K ctx · ${m.costIn}/$ {m.costOut} per 1M · caps {m.capabilities.join(', ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.lastTestStatus && (
                      <Badge variant="outline" className={cn('px-1.5 text-[10px]', m.lastTestStatus === 'PASS' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-500')}>
                        {m.lastTestStatus}{m.lastLatencyMs != null ? ` ${Math.round(m.lastLatencyMs)}ms` : ''}
                      </Badge>
                    )}
                    <Select
                      value={m.tier}
                      onValueChange={(v) =>
                        withBusy(async () => {
                          try {
                            await api.updateLlmModel({ id: m.id, tier: v });
                            await onReload();
                          } catch (e) {
                            toast({ title: 'Tier change blocked', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
                          }
                        })
                      }
                    >
                      <SelectTrigger className="h-7 w-[110px] text-xs" aria-label={`Routing tier for ${m.label}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PRIMARY">PRIMARY</SelectItem>
                        <SelectItem value="FALLBACK">FALLBACK</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={busy}
                      onClick={() =>
                        withBusy(async () => {
                          const res = await api.testLlmModel(m.id);
                          toast({ title: res.message, variant: res.ok ? 'default' : 'destructive' });
                          await onReload();
                        })
                      }
                    >
                      <FlaskConical className="h-3 w-3" /> Test
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><KeyRound className="h-4 w-4" /> Routing chains</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {CAPABILITIES.map((cap) => (
            <div key={cap} className="rounded-lg border p-2.5 text-sm">
              <p className="text-[11px] font-semibold text-muted-foreground">{cap}</p>
              <p className="mt-0.5 truncate text-xs">{llms.routing[cap]?.map((m) => m.label).join(' → ') || '— fallback'}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Connectors tab ──
function ConnectorsTab({
  connectors, busy, withBusy, onReload, onAdd, onPromote, onShowRun,
}: {
  connectors: OpsConnectorsDTO | null;
  busy: boolean;
  withBusy: (fn: () => Promise<void>) => Promise<void>;
  onReload: () => Promise<void>;
  onAdd: () => void;
  onPromote: (c: { id: string; name: string }, to: string) => void;
  onShowRun: (title: string, ok: boolean, details: { check: string; pass: boolean; note: string }[]) => void;
}) {
  const { toast } = useToast();
  if (!connectors) return <p className="p-6 text-sm text-muted-foreground">Loading connectors…</p>;
  const runTest = (id: string, name: string, kind: string) =>
    withBusy(async () => {
      const res = await api.testConnector(id, kind);
      toast({ title: res.message, variant: res.ok ? 'default' : 'destructive' });
      onShowRun(`${TEST_LABELS[kind as keyof typeof TEST_LABELS]} — ${name}`, res.ok, res.run.details);
      await onReload();
    });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Lifecycle: DRAFT → TESTING → CANARY → LIVE (pause/retire any time). Promotion is validated server-side against recorded test evidence.
        </p>
        <Button size="sm" className="h-9 bg-emerald-600 hover:bg-emerald-500" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" /> Add connector
        </Button>
      </div>

      {connectors.connectors.map((c) => {
        const next = NEXT_STATE[c.status];
        return (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                {(['DRAFT', 'TESTING', 'CANARY', 'LIVE'] as const).map((s) => (
                  <div key={s} className="flex items-center gap-1">
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full',
                        s === 'DRAFT' && 'bg-stone-400',
                        s === 'TESTING' && 'bg-sky-500',
                        s === 'CANARY' && 'bg-amber-500',
                        s === 'LIVE' && 'bg-emerald-500',
                        c.status !== s && 'opacity-25',
                      )}
                    />
                    <span className={cn('text-[10px] font-semibold', c.status === s ? 'text-foreground' : 'text-muted-foreground opacity-60')}>{s}</span>
                    {s !== 'LIVE' && <span className="mr-1 text-muted-foreground">›</span>}
                  </div>
                ))}
                {['PAUSED', 'RETIRED'].includes(c.status) && (
                  <Badge variant="outline" className={cn('px-1.5 text-[10px]', STATUS_STYLE[c.status])}>{c.status}</Badge>
                )}
                <span className="ml-auto text-[11px] text-muted-foreground">{c.adapterType} · {c.tier}-tier · {c.cadenceHours}h · {c.rateLimitRpm} rpm</span>
              </div>
              <CardTitle className="flex flex-wrap items-center gap-2 pt-1 text-sm">
                {c.name}
                <Badge variant="outline" className={cn('px-1.5 text-[10px]', STATUS_STYLE[c.status])}>{c.status}</Badge>
                {c.retailerName && <Badge variant="outline" className="px-1.5 text-[10px] text-muted-foreground">↔ {c.retailerName}</Badge>}
                <span className="ml-auto"><HealthBar score={c.healthScore} /></span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="truncate font-mono text-[11px] text-muted-foreground">{c.endpoint} · auth {c.authType}{c.authMasked ? ` (${c.authMasked})` : ''}</p>
              {c.notes && <p className="text-xs italic text-muted-foreground">{c.notes}</p>}
              <div className="flex flex-wrap gap-1.5">
                {c.lastRuns.map((r, i) => (
                  <Badge key={i} variant="outline" className={cn('px-1.5 text-[10px]', r.ok ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'border-red-500/30 text-red-500')}>
                    {r.kind.slice(0, 4)} {Math.round(r.score)}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Select onValueChange={(kind) => runTest(c.id, c.name, kind)} value="" disabled={busy}>
                  <SelectTrigger className="h-8 w-[150px] text-xs" aria-label={`Run a suite test on ${c.name}`}>
                    <SelectValue placeholder="Run suite test…" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEST_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>{TEST_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {next && (
                  <Button size="sm" className="h-8 bg-emerald-600 text-xs hover:bg-emerald-500" disabled={busy} onClick={() => onPromote(c, next)}>
                    Promote → {next}
                  </Button>
                )}
                {c.status === 'LIVE' && (
                  <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={() => onPromote(c, 'PAUSED')}>Pause</Button>
                )}
                {!['RETIRED'].includes(c.status) && (
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" disabled={busy} onClick={() => onPromote(c, 'RETIRED')}>Retire</Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Audit tab ──
function AuditTab({ overview }: { overview: OpsOverviewDTO | null }) {
  if (!overview) return <p className="p-6 text-sm text-muted-foreground">Loading audit…</p>;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Admin audit trail (append-only)</CardTitle>
        <p className="text-xs text-muted-foreground">Every console mutation writes an immutable AuditEvent — actor, action, target, detail.</p>
      </CardHeader>
      <CardContent className="space-y-1">
        {overview.audit.map((a) => {
          let detail = a.detail;
          try { detail = a.detail ? (JSON.parse(a.detail).detail ?? a.detail) : null; } catch { /* raw */ }
          return (
            <div key={a.id} className="flex flex-wrap items-baseline gap-2 border-b py-2 text-sm last:border-0">
              <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-muted-foreground">{a.action}</Badge>
              <span className="font-medium">{a.targetId}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{detail}</span>
              <span className="text-[11px] text-muted-foreground">{a.actor} · {timeAgo(a.createdAt)}</span>
            </div>
          );
        })}
        {overview.audit.length === 0 && <p className="text-xs text-muted-foreground">No admin actions recorded yet.</p>}
      </CardContent>
    </Card>
  );
}

// ── Add provider dialog ──
function ProviderDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => Promise<void> }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('openai');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!name.trim() || !apiKey.trim()) {
      toast({ title: 'Name and an API key are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await api.createLlmProvider({ name, kind, baseUrl: baseUrl || undefined, apiKey, notes: notes || undefined });
      toast({ title: `${name} registered`, description: 'Key stored masked-only — it is never displayed again.' });
      onOpenChange(false);
      setName(''); setBaseUrl(''); setApiKey(''); setNotes('');
      await onDone();
    } catch (e) {
      toast({ title: 'Could not register provider', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="text-base">Add LLM provider</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="prov-name">Name</Label>
            <Input id="prov-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Azure OpenAI" />
          </div>
          <div className="space-y-1">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger aria-label="Provider kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">openai</SelectItem>
                <SelectItem value="anthropic">anthropic</SelectItem>
                <SelectItem value="google">google</SelectItem>
                <SelectItem value="custom">custom (OpenAI-compatible)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="prov-url">Base URL override</Label>
            <Input id="prov-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://… (optional)" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="prov-key">API key</Label>
            <Input id="prov-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" />
            <p className="text-[11px] text-muted-foreground">Stored masked (last 4 only) — never displayed, exported, or logged.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="prov-notes">Notes</Label>
            <Textarea id="prov-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Vendor context, contract notes…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-500" onClick={submit} disabled={saving}>Register provider</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Enroll model dialog ──
function ModelDialog({ open, onOpenChange, llms, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; llms: OpsLlmsDTO | null; onDone: () => Promise<void> }) {
  const { toast } = useToast();
  const [providerId, setProviderId] = useState('');
  const [modelId, setModelId] = useState('');
  const [label, setLabel] = useState('');
  const [contextK, setContextK] = useState('128');
  const [costIn, setCostIn] = useState('0.15');
  const [costOut, setCostOut] = useState('0.60');
  const [caps, setCaps] = useState<string[]>(['RANK']);
  const [tier, setTier] = useState('FALLBACK');
  const [saving, setSaving] = useState(false);
  const providers = llms?.providers.filter((p) => p.status === 'ACTIVE') ?? [];
  const activePid = providerId || providers[0]?.id || '';
  const submit = async () => {
    if (!activePid || !modelId.trim() || !caps.length) {
      toast({ title: 'Provider, model id and at least one capability are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await api.enrollLlmModel({
        providerId: activePid, modelId, label: label || undefined,
        contextK: Number(contextK) || 128, costIn: Number(costIn) || 0, costOut: Number(costOut) || 0,
        capabilities: caps, tier, enabled: false,
      });
      toast({ title: `${label || modelId} enrolled`, description: 'Run a connection test, then enable it for routing.' });
      onOpenChange(false);
      setModelId(''); setLabel('');
      await onDone();
    } catch (e) {
      toast({ title: 'Enrollment failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="text-base">Enroll model</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Provider</Label>
            <Select value={activePid} onValueChange={setProviderId}>
              <SelectTrigger aria-label="Provider"><SelectValue placeholder="Choose provider" /></SelectTrigger>
              <SelectContent>
                {providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="model-id">Model id</Label>
              <Input id="model-id" value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="gpt-4o-mini" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="model-label">Label</Label>
              <Input id="model-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="GPT-4o mini" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="model-ctx">Context (K)</Label>
              <Input id="model-ctx" type="number" value={contextK} onChange={(e) => setContextK(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="model-cin">$ in /1M</Label>
              <Input id="model-cin" type="number" step="0.01" value={costIn} onChange={(e) => setCostIn(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="model-cout">$ out /1M</Label>
              <Input id="model-cout" type="number" step="0.01" value={costOut} onChange={(e) => setCostOut(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Capabilities</Label>
            <div className="flex flex-wrap gap-2">
              {CAPABILITIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCaps((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))}
                  className={cn(
                    'h-8 rounded-md border px-2.5 text-xs font-medium',
                    caps.includes(c) ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label>Routing tier</Label>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger aria-label="Routing tier"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PRIMARY">PRIMARY (must pass a test first)</SelectItem>
                <SelectItem value="FALLBACK">FALLBACK</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-500" onClick={submit} disabled={saving}>Enroll</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add connector dialog ──
function ConnectorDialog({ open, onOpenChange, connectors, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; connectors: OpsConnectorsDTO | null; onDone: () => Promise<void> }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [adapterType, setAdapterType] = useState('CRAWLER');
  const [endpoint, setEndpoint] = useState('');
  const [authType, setAuthType] = useState('NONE');
  const [authSecret, setAuthSecret] = useState('');
  const [rateLimitRpm, setRateLimitRpm] = useState('60');
  const [cadenceHours, setCadenceHours] = useState('24');
  const [tier, setTier] = useState('B');
  const [retailerId, setRetailerId] = useState('none');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const linked = new Set((connectors?.connectors ?? []).filter((c) => c.retailerId && c.status !== 'RETIRED').map((c) => c.retailerId));
  const available = (connectors?.retailers ?? []).filter((r) => !linked.has(r.id));
  const submit = async () => {
    if (!name.trim() || !endpoint.trim()) {
      toast({ title: 'Name and endpoint are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await api.createConnector({
        name, adapterType, endpoint, authType, authSecret: authSecret || undefined,
        rateLimitRpm: Number(rateLimitRpm) || 60, cadenceHours: Number(cadenceHours) || 24, tier,
        retailerId: retailerId !== 'none' ? retailerId : undefined, notes: notes || undefined,
      });
      toast({ title: `${name} created in DRAFT`, description: 'Run CONNECTIVITY to move it into TESTING.' });
      onOpenChange(false);
      setName(''); setEndpoint(''); setAuthSecret(''); setNotes('');
      await onDone();
    } catch (e) {
      toast({ title: 'Could not create connector', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="text-base">Add supplier connector</DialogTitle></DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          <div className="space-y-1">
            <Label htmlFor="conn-name">Supplier name</Label>
            <Input id="conn-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Overstock" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Adapter</Label>
              <Select value={adapterType} onValueChange={setAdapterType}>
                <SelectTrigger aria-label="Adapter type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CRAWLER">CRAWLER</SelectItem>
                  <SelectItem value="API">API</SelectItem>
                  <SelectItem value="RSS">RSS</SelectItem>
                  <SelectItem value="MANUAL_UPLOAD">MANUAL_UPLOAD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tier</Label>
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger aria-label="Tier"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A — high velocity</SelectItem>
                  <SelectItem value="B">B — full catalog</SelectItem>
                  <SelectItem value="C">C — long tail</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="conn-endpoint">Endpoint</Label>
            <Input id="conn-endpoint" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="example.com/deals/sitemap.xml" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Auth</Label>
              <Select value={authType} onValueChange={setAuthType}>
                <SelectTrigger aria-label="Auth type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">NONE</SelectItem>
                  <SelectItem value="API_KEY">API_KEY</SelectItem>
                  <SelectItem value="OAUTH">OAUTH</SelectItem>
                  <SelectItem value="COOKIES">COOKIES</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="conn-secret">Auth secret</Label>
              <Input id="conn-secret" type="password" value={authSecret} onChange={(e) => setAuthSecret(e.target.value)} disabled={authType === 'NONE'} placeholder={authType === 'NONE' ? '—' : 'stored masked'} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="conn-rpm">Rate limit (rpm)</Label>
              <Input id="conn-rpm" type="number" value={rateLimitRpm} onChange={(e) => setRateLimitRpm(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="conn-cad">Cadence (h)</Label>
              <Input id="conn-cad" type="number" value={cadenceHours} onChange={(e) => setCadenceHours(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Link catalog retailer (optional)</Label>
            <Select value={retailerId} onValueChange={setRetailerId}>
              <SelectTrigger aria-label="Link retailer"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not linked yet</SelectItem>
                {available.slice(0, 40).map((r) => <SelectItem key={r.id} value={r.id}>{r.name} ({r.tier})</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Linkage goes live only when the connector reaches LIVE.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="conn-notes">Notes</Label>
            <Textarea id="conn-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-500" onClick={submit} disabled={saving}>Create connector</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
