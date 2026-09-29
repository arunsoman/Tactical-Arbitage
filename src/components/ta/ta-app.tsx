'use client';

// Tactical Arbitrage — app shell: sidebar nav, topbar (global scan runner),
// view switching, and the first-run onboarding gate.

import { useCallback, useEffect, useRef } from 'react';
import { useTAStore, type View } from './store';
import { api, type BootstrapDTO } from '@/lib/ta/api';
import { PLANS, SCHEDULE_HOURS } from '@/lib/ta/types';
import { ProductImage } from './product-image';
import { DashboardView } from './dashboard';
import { DealFinderView } from './deal-finder';
import { SavedScansView } from './scans';
import { PipelineView } from './pipeline';
import { RetailersView } from './retailers';
import { BillingView } from './billing';
import { SettingsView } from './settings-view';
import { OnboardingWizard } from './onboarding';
import { LeadDrawer } from './lead-drawer';
import { useToast } from '@/hooks/use-toast';
import {
  LayoutDashboard,
  Radar,
  BookmarkCheck,
  KanbanSquare,
  Store,
  CreditCard,
  Settings,
  Play,
  RefreshCw,
  Bell,
  MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const NAV: { id: View; label: string; icon: typeof LayoutDashboard; hint?: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'deals', label: 'Deal Finder', icon: Radar },
  { id: 'scans', label: 'Saved Scans', icon: BookmarkCheck },
  { id: 'pipeline', label: 'Pipeline', icon: KanbanSquare },
  { id: 'retailers', label: 'Retailers', icon: Store },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function TAApp() {
  const { view, setView, bootstrap, setBootstrap, scanning, setScanning, bumpDealRefresh } = useTAStore();
  const { toast } = useToast();

  const loadBootstrap = useCallback(async () => {
    try {
      const b = await api.bootstrap();
      setBootstrap(b);
    } catch (e) {
      toast({ title: 'Failed to load app data', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  }, [setBootstrap, toast]);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      const res = await api.scanRun({ retailerLimit: 5 });
      const t = res.summary.totals;
      toast({
        title: `Scan cycle complete — ${t.newLeads} new leads`,
        description: `${t.jobs} retailers scanned · ${t.priceUpdates} price updates · ${(res.summary.durationMs / 1000).toFixed(1)}s`,
      });
      bumpDealRefresh();
      loadBootstrap();
    } catch (e) {
      toast({ title: 'Scan could not start', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  }, [setScanning, toast, bumpDealRefresh, loadBootstrap]);

  // Scheduler: while the app is open, run any active saved scan whose interval has elapsed
  // (one per tick). There is no server-side cron in this demo build.
  const autoRunning = useRef(false);
  const onboarded = bootstrap?.settings.onboarded ?? false;
  useEffect(() => {
    if (!onboarded) return;
    const tick = async () => {
      if (autoRunning.current || useTAStore.getState().scanning) return;
      autoRunning.current = true;
      try {
        const { scans } = await api.scanSets();
        const due = scans.find((s) => {
          const hours = SCHEDULE_HOURS[s.schedule];
          return s.active && hours != null && Date.now() - new Date(s.lastRunAt ?? 0).getTime() >= hours * 3600e3;
        });
        if (!due) return;
        const res = await api.scanRun({ scanSetId: due.id, retailerLimit: 4 });
        toast({ title: `Scheduled scan "${due.name}" ran`, description: `${res.summary.totals.newLeads} new matching leads — open Saved Scans → Show results.` });
        bumpDealRefresh();
        void loadBootstrap();
      } catch {
        // slot busy or transient failure — try again next tick
      } finally {
        autoRunning.current = false;
      }
    };
    const first = setTimeout(tick, 5000);
    const every = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [onboarded, toast, bumpDealRefresh, loadBootstrap]);

  if (!bootstrap) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Radar className="h-8 w-8 animate-pulse text-emerald-600" />
          <p className="text-sm">Loading Tactical Arbitrage…</p>
        </div>
      </div>
    );
  }

  const settings = bootstrap.settings;
  const plan = PLANS[settings.plan];

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-slate-900 text-slate-300 md:flex">
        <div className="flex items-center gap-2.5 px-5 pb-2 pt-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-slate-950">
            <Radar className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight text-white">Tactical Arbitrage</p>
            <p className="text-[10px] leading-tight text-slate-400">OA sourcing platform</p>
          </div>
        </div>

        <nav className="mt-4 flex-1 space-y-0.5 px-3" aria-label="Main navigation">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                view === item.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              )}
            >
              <item.icon className={cn('h-4 w-4', view === item.id && 'text-emerald-400')} />
              {item.label}
              {item.id === 'pipeline' && bootstrap.counts.pipelineCount > 0 && (
                <span className="ml-auto rounded-full bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-200">
                  {bootstrap.counts.pipelineCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <div className="rounded-lg bg-slate-800/70 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-white">{plan.name} plan</p>
              <Badge className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15" variant="secondary">
                ${plan.price}/mo
              </Badge>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-slate-400">
              {plan.savedScans == null ? 'Unlimited scans' : `${bootstrap.counts.scansets}/${plan.savedScans} saved scans`} · {plan.concurrentScanSlots} scan slots
            </p>
            {settings.plan !== 'EXPERT' && (
              <Button size="sm" className="mt-2 h-7 w-full bg-emerald-600 text-xs hover:bg-emerald-500" onClick={() => setView('billing')}>
                Upgrade
              </Button>
            )}
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 md:px-6">
            {/* mobile "more" overflow nav — bottom nav covers the primary 5 */}
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="More options">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>More</DropdownMenuLabel>
                  {NAV.slice(5).map((item) => (
                    <DropdownMenuItem key={item.id} onClick={() => setView(item.id)}>
                      <item.icon className="mr-2 h-4 w-4" /> {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* mobile page title — the bottom nav's active state is easy to miss */}
            <div className="flex min-w-0 flex-1 items-center md:hidden">
              <span className="truncate text-sm font-semibold text-slate-800">{NAV.find((n) => n.id === view)?.label}</span>
            </div>

            <div className="hidden items-center gap-2 md:flex">
              <span className="text-sm font-semibold text-slate-800">{NAV.find((n) => n.id === view)?.label}</span>
              <Badge variant="outline" className="text-[10px] text-slate-500">
                Amazon {settings.marketplace}
              </Badge>
              <Badge variant="outline" className="text-[10px] text-slate-500">
                {settings.sourcingState} (tax-free)
              </Badge>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                onClick={runScan}
                disabled={scanning}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-500"
                aria-label="Run scan cycle across retailers"
              >
                {scanning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {scanning ? 'Scanning…' : 'Run scan'}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
                    <Bell className="h-4 w-4" />
                    {bootstrap.counts.reviewQueue > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[9px] font-bold text-white">
                        {bootstrap.counts.reviewQueue}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>Match review queue</DropdownMenuLabel>
                  <div className="px-3 pb-2 text-xs text-slate-500">
                    {bootstrap.counts.reviewQueue} matches at 0.85–0.96 confidence need review (FR-2.2).
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Daily digest</DropdownMenuLabel>
                  <div className="px-3 pb-2 text-xs text-slate-500">
                    Next digest 7:00 AM — top {Math.min(25, bootstrap.counts.freshLeads)} fresh leads across your saved scans.
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="hidden items-center gap-2 sm:flex">
                <div className="text-right">
                  <p className="text-xs font-semibold leading-tight">Scaling Sofia</p>
                  <p className="text-[10px] leading-tight text-slate-500">{plan.name} · annual</p>
                </div>
                <ProductImage imageKey="avatar" title="Sofia scaling seller" category="Beauty" className="h-8 w-8 rounded-full text-[10px]" />
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-3 py-4 pb-24 sm:px-4 md:p-6">
          {view === 'dashboard' && <DashboardView />}
          {view === 'deals' && <DealFinderView />}
          {view === 'scans' && <SavedScansView />}
          {view === 'pipeline' && <PipelineView />}
          {view === 'retailers' && <RetailersView />}
          {view === 'billing' && <BillingView />}
          {view === 'settings' && <SettingsView />}
        </main>

        <footer className="mt-auto hidden border-t border-slate-200 bg-white px-6 py-3 md:block">
          <p className="text-center text-[11px] text-slate-400">
            Tactical Arbitrage · demo build · scan→match→calculate→filter→act · retailer names model the production scan network, but all data is generated locally — no requests are made to these stores
          </p>
        </footer>

        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden" aria-label="Mobile navigation">
          {NAV.slice(0, 5).map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-medium',
                view === item.id ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500'
              )}
              aria-current={view === item.id ? 'page' : undefined}
            >
              <item.icon className="h-4 w-4" />
              <span className="max-w-full truncate">{item.label.replace('Deal ', '')}</span>
            </button>
          ))}
        </nav>
      </div>

      {!settings.onboarded && <OnboardingWizard onDone={loadBootstrap} />}
      <LeadDrawer />
    </div>
  );
}
