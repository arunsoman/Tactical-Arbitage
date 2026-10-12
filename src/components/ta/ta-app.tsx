'use client';

// Tactical Arbitrage — investor-demo shell.
//
// SCOPE: only the AI feature set funded by this build is live —
//   (1) evidence-linked AI ranking + reasoning, (2) NL deal search (typed+voice),
//   (3) buy-or-wait opportunity verdict, (4) calibrated confidence, (5) feedback
//   loop, (6) grounded demo assistant.
// Every other surface (Dashboard, Deal Finder, Saved Scans, Pipeline, Alerts,
// Retailers, Team, AI Status, Billing, Settings, Ops, Care, Support, BuyWise)
// renders grayed out in the nav and can't be activated.
// Mobile (<md): bottom tab bar with Picks / Ask / Assistant + a grayed "More".
// Desktop (≥md): full sidebar, same scoping. Dark mode by default (§10).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTAStore, isViewEnabled, type View } from './store';
import { api, type BootstrapDTO } from '@/lib/ta/api';
import { PLANS } from '@/lib/ta/types';
import { ProductImage } from './product-image';
import { PortalLauncher } from '@/components/portal-launcher';
import { PicksView } from './picks-view';
import { SearchView } from './search-view';
import { AssistantView } from './assistant-view';
import { LockedView } from './locked-view';
import { OnboardingWizard } from './onboarding';
import { DealDetailSheet } from './deal-detail-sheet';
import { useTheme } from 'next-themes';
import { useToast } from '@/hooks/use-toast';
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
  Lock,
  MessageSquareMore,
  Moon,
  Radar,
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
  { id: 'search', label: 'Ask Deals (NL)', icon: Radar },
  { id: 'assistant', label: 'Demo Assistant', icon: MessageSquareMore },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'deals', label: 'Deal Finder', icon: Radar },
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
  { id: 'search', label: 'Ask', icon: Radar },
  { id: 'assistant', label: 'Assistant', icon: MessageSquareMore },
];

export function TAApp() {
  const { view, setView, bootstrap, setBootstrap, bumpDealRefresh, bumpPicksRefresh, openLead, selectedLeadId, deepLinkLeadId, setDeepLinkLeadId } = useTAStore();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const toastGray = useCallback(
    (label: string) =>
      toast({
        title: `${label} — not covered in the ₹15L build`,
        description: 'The funded scope is the AI intelligence layer; this surface is the post-budget roadmap. Open it from the sidebar for the full screen.',
      }),
    [toast]
  );

  const loadBootstrap = useCallback(async () => {
    try {
      const b = await api.bootstrap();
      setBootstrap(b);
    } catch (e) {
      toast({ title: 'Failed to load app data', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  }, [setBootstrap, toast]);

  useEffect(() => {
    // rAF-deferred mount flag (theme icon hydration guard) — keeps the effect body free of sync setState
    const id = requestAnimationFrame(() => setMounted(true));
    void loadBootstrap();
    return () => cancelAnimationFrame(id);
  }, [loadBootstrap]);

  // deep links: /?deal=<leadId> and /?view=<view> — view links are honored only
  // for the demo-scoped views; anything else explains itself and stays on Picks.
  useEffect(() => {
    if (!bootstrap) return;
    const params = new URLSearchParams(window.location.search);
    const deal = params.get('deal');
    const v = params.get('view') as View | null;
    if (v) setView(v); // honored for any view — non-scope views render the locked roadmap screen
    if (deal) {
      setDeepLinkLeadId(deal);
      openLead(deal);
    }
    if (deal || v) window.history.replaceState({}, '', '/');
     
  }, [bootstrap]);

  // theme sync from server settings (first load only)
  useEffect(() => {
    if (!bootstrap || !mounted) return;
    if (bootstrap.settings.theme && bootstrap.settings.theme !== theme) {
      setTheme(bootstrap.settings.theme);
    }
  }, [bootstrap?.settings.theme, mounted]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    void api.updateSettings({ theme: next });
  };

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

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* ---------- Desktop sidebar ---------- */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2.5 px-5 pb-2 pt-5">
          { }
          <img src="/icon.png" alt="" className="h-8 w-8 rounded-lg" />
          <div>
            <p className="text-sm font-bold leading-tight">Tactical Arbitrage</p>
            <p className="text-[10px] leading-tight text-muted-foreground">AI investor demo · 6-feature scope</p>
          </div>
        </div>

        <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Main navigation">
          {DESKTOP_NAV.map((item) => {
            const enabled = isViewEnabled(item.id);
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                aria-current={enabled && view === item.id ? 'page' : undefined}
                aria-disabled={!enabled}
                title={enabled ? item.label : `${item.label} — not covered in the ₹15L build (opens the roadmap screen)`}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  enabled && view === item.id
                    ? 'bg-sidebar-accent text-foreground'
                    : enabled
                      ? 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'
                      : 'cursor-not-allowed text-muted-foreground/45 hover:bg-transparent'
                )}
              >
                <item.icon className={cn('h-4 w-4', enabled && view === item.id && 'text-emerald-500')} />
                <span className="min-w-0 truncate">{item.label}</span>
                {!enabled && <Lock className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/50" aria-hidden />}
                {enabled && item.id === 'assistant' && (
                  <span className="ml-auto rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">NEW</span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            title="BuyWise Shop — not covered in the ₹15L build"
            onClick={() => toastGray('BuyWise Shop')}
            className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground/45"
          >
            <Store className="h-4 w-4" />
            <span className="min-w-0 truncate">BuyWise Shop</span>
            <Lock className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/50" aria-hidden />
          </button>
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
              Mock billing shown for context — plan changes are outside this demo's scope.
            </p>
            <button
              type="button"
              onClick={() => setView('billing')}
              className="mt-2 h-7 w-full rounded-md bg-emerald-600/40 text-xs font-semibold text-white/70 transition-colors hover:bg-emerald-600/60"
              title="Billing — not covered in the ₹15L build (opens the roadmap screen)"
              aria-label="Upgrade (roadmap screen)"
            >
              Upgrade
            </button>
          </div>
        </div>
      </aside>

      {/* ---------- Main column ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-3 md:px-6">
            {/* mobile brand */}
            <div className="flex items-center gap-2 md:hidden">
              { }
              <img src="/icon.png" alt="" className="h-7 w-7 rounded-md" />
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
              <PortalLauncher current="ta" enabled={['ta']} onLocked={(label) => toastGray(`${label} portal`)} />

              <span title="Scan engine is grayed out in this AI demo — the store ships pre-loaded with fresh data">
                <Button size="sm" disabled className="h-9 gap-1.5 bg-emerald-600/40 md:h-8" aria-disabled aria-label="Scan engine disabled in demo scope">
                  <Radar className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Run scan</span>
                  <span className="sm:hidden">Scan</span>
                </Button>
              </span>

              <Button variant="ghost" size="icon" className="h-11 w-11 md:h-8 md:w-8" aria-label="Toggle dark mode" onClick={toggleTheme}>
                {mounted && theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>

              <button
                type="button"
                aria-label="Alerts — not covered in the ₹15L build"
                title="Alerts — not covered in the ₹15L build (opens the roadmap screen)"
                className="relative flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground/45 transition-colors hover:bg-accent/40 md:h-8 md:w-8"
                onClick={() => setView('alerts')}
              >
                <Bell className="h-4 w-4" />
                <Lock className="absolute right-0.5 top-0.5 h-2.5 w-2.5" aria-hidden />
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

        <main className="flex flex-1 flex-col pb-16 md:pb-0">
          {view === 'picks' && <PicksView />}
          {view === 'search' && <SearchView />}
          {view === 'assistant' && <AssistantView />}
          {!isViewEnabled(view) && <LockedView view={view} />}
        </main>

        <footer className="mt-auto hidden border-t border-border px-6 py-3 md:block">
          <p className="text-center text-[11px] text-muted-foreground">
            AI investor demo — live: evidence-linked ranking · NL search · buy-or-wait verdicts · calibrated confidence · feedback loop · grounded assistant. Everything grayed out is the post-budget roadmap. All data is generated locally; no requests are made to real retailers.
          </p>
        </footer>
      </div>

      {/* ---------- Mobile bottom tab bar ---------- */}
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
            {t.id === 'assistant' && (
              <span className="absolute right-[18%] top-1.5 rounded-full bg-emerald-500 px-1 py-0.5 text-[8px] font-bold text-slate-950">NEW</span>
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          className={cn('flex h-16 flex-1 flex-col items-center justify-center gap-0.5', moreOpen ? 'text-emerald-500' : 'text-muted-foreground')}
        >
          <LayoutDashboard className="h-5 w-5" />
          <span className="text-[10px] font-semibold">More</span>
        </button>
      </nav>

      {/* "More" sheet — everything beyond the three live surfaces, locked to the roadmap screen */}
      <MobileMoreSheet open={moreOpen} toastGray={toastGray} onGo={setView} onClose={() => setMoreOpen(false)} />

      {!settings.onboarded && <OnboardingWizard onDone={loadBootstrap} />}

      {/* deal detail sheet — responsive, lands on the verdict panel */}
      <DemoDetailBridge
        leadId={deepLinkLeadId ?? selectedLeadId}
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

function MobileMoreSheet({ open, toastGray, onGo, onClose }: { open: boolean; toastGray: (label: string) => void; onGo: (v: View) => void; onClose: () => void }) {
  if (!open) return null;
  const items = DESKTOP_NAV.filter((n) => !TABS.some((t) => t.id === n.id));
  return (
    <div className="pb-safe fixed inset-x-0 bottom-16 z-30 border-t border-border bg-card p-3 shadow-lg md:hidden" role="navigation" aria-label="More sections" onClick={onClose}>
      <p className="pb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Not covered in the ₹15L build — opens the roadmap screen</p>
      <div className="grid grid-cols-4 gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            title={`${item.label} — not covered in this build`}
            onClick={(e) => {
              e.stopPropagation();
              onGo(item.id);
            }}
            className="flex h-14 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-background text-[10px] font-semibold text-muted-foreground/45"
          >
            <span className="relative">
              <item.icon className="h-4 w-4" />
              <Lock className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5" aria-hidden />
            </span>
            {item.label.split(' ')[0]}
          </button>
        ))}
        <button
          type="button"
          title="BuyWise — grayed out"
          onClick={(e) => {
            e.stopPropagation();
            toastGray('BuyWise Shop');
          }}
          className="flex h-14 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-background text-[10px] font-semibold text-muted-foreground/45"
        >
          <span className="relative">
            <Store className="h-4 w-4" />
            <Lock className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5" aria-hidden />
          </span>
          BuyWise
        </button>
      </div>
    </div>
  );
}

/** Deep-linked / notification-opened deals — the detail sheet works at every width. */
function DemoDetailBridge({
  leadId,
  onClosed,
  onChanged,
}: {
  leadId: string | null;
  onClosed: () => void;
  onChanged: () => void;
}) {
  const [pick, setPick] = useState<Parameters<typeof DealDetailSheet>[0]['pick']>(null);
  const [pickFor, setPickFor] = useState<string | null>(null);

  useEffect(() => {
    if (!leadId) return;
    let cancelled = false;
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
            reason: 'Opened from a deep link — the full detail and verdict load below.',
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
  }, [leadId]);

  if (!leadId || !pick || pickFor !== leadId) return null;
  return <DealDetailSheet pick={pick} onClose={onClosed} onChanged={onChanged} />;
}