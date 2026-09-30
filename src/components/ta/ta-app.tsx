'use client';

// Tactical Arbitrage — AI-first v2.2 shell.
// Mobile (<md): bottom tab bar, AI Picks as home, thumb-friendly everything.
// Desktop (≥md): full sidebar with dense power tools (progressive enhancement).
// Dark mode by default (§10), theme toggle in both navs.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTAStore, type View } from './store';
import { api, type BootstrapDTO } from '@/lib/ta/api';
import { PLANS, SCHEDULE_HOURS } from '@/lib/ta/types';
import { ProductImage } from './product-image';
import { PortalLauncher } from '@/components/portal-launcher';
import { PicksView } from './picks-view';
import { SearchView } from './search-view';
import { AlertsView } from './alerts-view';
import { TeamView } from './team-view';
import { AiStatusView } from './ai-status-view';
import { DashboardView } from './dashboard';
import { DealFinderView } from './deal-finder';
import { SavedScansView } from './scans';
import { PipelineView } from './pipeline';
import { RetailersView } from './retailers';
import { BillingView } from './billing';
import { SettingsView } from './settings-view';
import { OpsView } from './ops-view';
import { CareView } from './care-view';
import { SupportView } from './support-view';
import { OnboardingWizard } from './onboarding';
import { LeadDrawer } from './lead-drawer';
import { DealDetailSheet } from './deal-detail-sheet';
import { useTheme } from 'next-themes';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  Bell,
  BookmarkCheck,
  BrainCircuit,
  CreditCard,
  Headset,
  HelpCircle,
  Home,
  KanbanSquare,
  LayoutDashboard,
  Moon,
  Play,
  Radar,
  RefreshCw,
  Search,
  Settings,
  Store,
  Sun,
  Users,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const DESKTOP_NAV: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'picks', label: 'AI Picks', icon: Home },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'deals', label: 'Deal Finder', icon: Radar },
  { id: 'search', label: 'Ask Deals (NL)', icon: Search },
  { id: 'scans', label: 'Saved Scans', icon: BookmarkCheck },
  { id: 'pipeline', label: 'Pipeline', icon: KanbanSquare },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'retailers', label: 'Retailers', icon: Store },
  { id: 'team', label: 'Team & Audit', icon: Users },
  { id: 'ai', label: 'AI Status', icon: BrainCircuit },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'support', label: 'Help & Support', icon: HelpCircle },
  { id: 'ops', label: 'Ops Console', icon: Wrench },
  { id: 'care', label: 'Care Console', icon: Headset },
];

const TABS: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'picks', label: 'Picks', icon: Home },
  { id: 'search', label: 'Ask', icon: Search },
  { id: 'pipeline', label: 'Pipeline', icon: KanbanSquare },
  { id: 'alerts', label: 'Alerts', icon: Bell },
];

export function TAApp() {
  const { view, setView, bootstrap, setBootstrap, scanning, setScanning, bumpDealRefresh, bumpPicksRefresh, openLead, selectedLeadId, deepLinkLeadId, setDeepLinkLeadId } = useTAStore();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const loadBootstrap = useCallback(async () => {
    try {
      const b = await api.bootstrap();
      setBootstrap(b);
    } catch (e) {
      toast({ title: 'Failed to load app data', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  }, [setBootstrap, toast]);

  useEffect(() => {
    setMounted(true);
    void loadBootstrap();
  }, [loadBootstrap]);

  // deep links: /?deal=<leadId> (notifications) and /?view=<view>
  useEffect(() => {
    if (!bootstrap) return;
    const params = new URLSearchParams(window.location.search);
    const deal = params.get('deal');
    const v = params.get('view') as View | null;
    if (v) setView(v);
    if (deal) {
      setDeepLinkLeadId(deal);
      openLead(deal);
    }
    // clean the URL so refresh doesn't re-open
    if (deal || v) window.history.replaceState({}, '', '/');
  }, [bootstrap]);

  // theme sync from server settings (first load only)
  useEffect(() => {
    if (!bootstrap || !mounted) return;
    if (bootstrap.settings.theme && bootstrap.settings.theme !== theme) {
      setTheme(bootstrap.settings.theme);
    }
  }, [bootstrap?.settings.theme, mounted]);

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
      bumpPicksRefresh();
      void api.picks(true); // re-rank immediately so picks reflect the scan (§7 caching note)
      loadBootstrap();
    } catch (e) {
      toast({ title: 'Scan could not start', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  }, [setScanning, toast, bumpDealRefresh, bumpPicksRefresh, loadBootstrap]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    void api.updateSettings({ theme: next });
  };

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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Radar className="h-8 w-8 animate-pulse text-emerald-500" />
          <p className="text-sm">Loading Tactical Arbitrage…</p>
        </div>
      </div>
    );
  }

  const settings = bootstrap.settings;
  const plan = PLANS[settings.plan];
  const unread = bootstrap.counts.unreadNotifications;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* ---------- Desktop sidebar (progressive enhancement, §11) ---------- */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2.5 px-5 pb-2 pt-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-slate-950">
            <Radar className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight">Tactical Arbitrage</p>
            <p className="text-[10px] leading-tight text-muted-foreground">AI-first OA sourcing</p>
          </div>
        </div>

        <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Main navigation">
          {DESKTOP_NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                view === item.id ? 'bg-sidebar-accent text-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'
              )}
            >
              <item.icon className={cn('h-4 w-4', view === item.id && 'text-emerald-500')} />
              {item.label}
              {item.id === 'pipeline' && bootstrap.counts.pipelineCount > 0 && (
                <span className="ml-auto rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold">{bootstrap.counts.pipelineCount}</span>
              )}
              {item.id === 'alerts' && unread > 0 && (
                <span className="ml-auto rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">{unread}</span>
              )}
              {item.id === 'care' && bootstrap.counts.openCareTickets > 0 && (
                <span className="ml-auto rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">{bootstrap.counts.openCareTickets}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="rounded-lg bg-sidebar-accent p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">{plan.name} plan</p>
              <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400" variant="secondary">
                ${plan.price}/mo
              </Badge>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
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

      {/* ---------- Main column ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-3 md:px-6">
            {/* mobile brand */}
            <div className="flex items-center gap-2 md:hidden">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-slate-950">
                <Radar className="h-4 w-4" />
              </div>
              <span className="text-sm font-bold">TA</span>
            </div>

            <div className="hidden items-center gap-2 md:flex">
              <span className="text-sm font-semibold">{DESKTOP_NAV.find((n) => n.id === view)?.label}</span>
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Amazon {settings.marketplace}
              </Badge>
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                {settings.sourcingState} (tax-free)
              </Badge>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <PortalLauncher current="ta" />

              <Button
                size="sm"
                onClick={runScan}
                disabled={scanning}
                className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-500 md:h-8"
                aria-label="Run scan cycle across retailers"
              >
                {scanning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{scanning ? 'Scanning…' : 'Run scan'}</span>
                <span className="sm:hidden">Scan</span>
              </Button>

              <Button variant="ghost" size="icon" className="h-11 w-11 md:h-8 md:w-8" aria-label="Toggle dark mode" onClick={toggleTheme}>
                {mounted && theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>

              <button
                type="button"
                aria-label={`Alerts${unread ? ` — ${unread} unread` : ''}`}
                className="relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-accent md:h-8 md:w-8"
                onClick={() => setView('alerts')}
              >
                <Bell className="h-4 w-4" />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-0.5 text-[9px] font-bold text-slate-950">
                    {unread}
                  </span>
                )}
              </button>

              <div className="hidden items-center gap-2 sm:flex">
                <div className="text-right">
                  <p className="text-xs font-semibold leading-tight">Scaling Sofia</p>
                  <p className="text-[10px] leading-tight text-muted-foreground">{plan.name} · annual</p>
                </div>
                <ProductImage imageKey="avatar" title="Sofia scaling seller" category="Beauty" className="h-8 w-8 rounded-full text-[10px]" />
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 pb-16 md:pb-0">
          {view === 'picks' && <PicksView />}
          {view === 'search' && <SearchView />}
          {view === 'alerts' && <AlertsView />}
          {view === 'team' && <TeamView />}
          {view === 'ai' && <AiStatusView />}
          {view === 'dashboard' && <DashboardView />}
          {view === 'deals' && <DealFinderView />}
          {view === 'scans' && <SavedScansView />}
          {view === 'pipeline' && <PipelineView />}
          {view === 'retailers' && <RetailersView />}
          {view === 'billing' && <BillingView />}
          {view === 'settings' && <SettingsView />}
          {view === 'ops' && <OpsView />}
          {view === 'care' && <CareView />}
          {view === 'support' && <SupportView />}
        </main>

        <footer className="mt-auto hidden border-t border-border px-6 py-3 md:block">
          <p className="text-center text-[11px] text-muted-foreground">
            Tactical Arbitrage · AI-first v2.2 demo build · retailer names model the production scan network, but all data is generated locally — no requests are made to these stores
          </p>
        </footer>
      </div>

      {/* ---------- Mobile bottom tab bar (§10: thumb-friendly primary nav) ---------- */}
      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card/95 backdrop-blur md:hidden"
        aria-label="Primary mobile navigation"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setView(t.id)}
            aria-current={view === t.id ? 'page' : undefined}
            className={cn('relative flex h-16 flex-1 flex-col items-center justify-center gap-0.5', view === t.id ? 'text-emerald-500' : 'text-muted-foreground')}
          >
            <t.icon className="h-5 w-5" />
            <span className="text-[10px] font-semibold">{t.label}</span>
            {t.id === 'alerts' && unread > 0 && (
              <span className="absolute right-[22%] top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-0.5 text-[9px] font-bold text-slate-950">{unread}</span>
            )}
            {t.id === 'pipeline' && bootstrap.counts.pipelineCount > 0 && (
              <span className="absolute right-[22%] top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-secondary px-0.5 text-[9px] font-bold">{bootstrap.counts.pipelineCount}</span>
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          className={cn('flex h-16 flex-1 flex-col items-center justify-center gap-0.5', moreOpen || MORE_OPEN.has(view) ? 'text-emerald-500' : 'text-muted-foreground')}
        >
          <LayoutDashboard className="h-5 w-5" />
          <span className="text-[10px] font-semibold">More</span>
        </button>
      </nav>

      {/* "More" sheet for remaining views on mobile */}
      <MobileMoreSheet open={moreOpen} view={view} setView={(v) => { setView(v); setMoreOpen(false); }} onClose={() => setMoreOpen(false)} />

      {!settings.onboarded && <OnboardingWizard onDone={loadBootstrap} />}

      {/* Desktop lead drawer (power view) + mobile deal detail sheet (US-2/US-6) */}
      {!isMobile && <LeadDrawer />}
      <MobileDetailBridge
        bootstrap={bootstrap}
        leadId={isMobile ? deepLinkLeadId ?? selectedLeadId : null}
        onClosed={() => {
          setDeepLinkLeadId(null);
          openLead(null);
        }}
        onChanged={() => {
          bumpPicksRefresh();
          bumpDealRefresh();
        }}
      />
    </div>
  );
}

const MORE_OPEN = new Set<View>(['dashboard', 'deals', 'scans', 'retailers', 'billing', 'settings', 'team', 'ai', 'ops', 'care', 'support']);

function MobileMoreSheet({ open, view, setView, onClose }: { open: boolean; view: View; setView: (v: View) => void; onClose: () => void }) {
  if (!open) return null;
  const items = DESKTOP_NAV.filter((n) => !TABS.some((t) => t.id === n.id));
  return (
    <div className="pb-safe fixed inset-x-0 bottom-16 z-30 border-t border-border bg-card p-3 shadow-lg md:hidden" role="navigation" aria-label="More sections" onClick={onClose}>
      <div className="grid grid-cols-4 gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            className={cn(
              'flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-[10px] font-semibold',
              view === item.id ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-border bg-background text-muted-foreground'
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label.split(' ')[0]}
          </button>
        ))}
      </div>
    </div>
  );
}

function MobileDetailBridge({
  bootstrap,
  leadId,
  onClosed,
  onChanged,
}: {
  bootstrap: BootstrapDTO;
  leadId: string | null;
  onClosed: () => void;
  onChanged: () => void;
}) {
  const [pick, setPick] = useState<Parameters<typeof DealDetailSheet>[0]['pick']>(null);
  const [pickFor, setPickFor] = useState<string | null>(null);

  useEffect(() => {
    if (!leadId) return;
    // desktop has the LeadDrawer power panel — the mobile sheet is for phones only
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) return;
    let cancelled = false;
    // build a minimal pick from the picks snapshot when available, else fetch detail
    api
      .picks(false)
      .then((res) => {
        if (cancelled) return;
        const found = res.picks.find((p) => p.leadId === leadId);
        setPick(
          found ?? {
            leadId,
            rank: 0,
            aiScore: 0,
            baseScore: 0,
            confidence: { p: 0, band: 'LOW', sampleSize: 0, method: 'global-prior' },
            reason: 'Opened from a notification or pipeline — full detail below.',
            factors: [],
            personalization: 'NONE',
            lead: {
              id: leadId, asin: '', title: 'Loading…', brand: '', category: '', imageUrl: '', retailerId: '', retailerName: '',
              retailerPrice: 0, buyBox: 0, netProfit: 0, roiPct: 0, marginPct: 0, breakeven: 0, discountPct: 0,
              bsr: 0, fbaOffers: 0, riskFlags: '[]', score: 0, priceAgeH: 0, fresh: true, firstSeenAt: '',
            },
            inPipeline: false,
            estMonthlySales: 0,
          }
        );
        setPickFor(leadId);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [leadId, bootstrap]);

  if (!leadId || !pick || pickFor !== leadId) return null;
  return <DealDetailSheet pick={pick} onClose={onClosed} onChanged={onChanged} />;
}
