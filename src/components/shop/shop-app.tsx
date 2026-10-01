'use client';

// BuyWise — consumer shopping portal (TA-PRD-SHOP-1.0).
// A deliberately different surface: plain-language, no resale vocabulary, but
// it shares the suite's theme (dark by default, synced from saved settings). Renders at /?portal=shop from the same Next.js route; uses the
// platform's data + AI engines via /api/shop/* and the shared care system.

import { useCallback, useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { api, type ShopResultsDTO, type ShopSearchSummaryDTO } from '@/lib/ta/api';
import { PortalLauncher } from '@/components/portal-launcher';
import { ProductImage } from '@/components/ta/product-image';
import { cn } from '@/lib/utils';
import {
  BadgeCheck, BadgePercent, CheckCircle2, ChevronDown, ChevronUp, Headset, HelpCircle,
  Loader2, Moon, PackageCheck, Radar, Search, ShoppingBag, ShieldCheck, Star, Sun, Tag, Timer, TrendingDown, TrendingUp, Truck, X,
} from 'lucide-react';

type Page = 'home' | 'results' | 'watch' | 'help';
type SortKey = 'total' | 'eta' | 'rating';

const EXAMPLES = ['Bluetooth Earbuds', 'Collagen Peptides', 'Nonstick Cookware Set', 'RC Rock Crawler', 'Insulated Tumbler', 'LED Desk Lamp'];

const VERDICT_STYLE: Record<string, { chip: string; ring: string; label: string }> = {
  BUY_NOW: { chip: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30', ring: 'text-emerald-600', label: 'Buy now' },
  BUY: { chip: 'bg-teal-500/10 text-teal-800 dark:text-teal-300 border-teal-500/30', ring: 'text-teal-600', label: 'Buy (see notes)' },
  WAIT: { chip: 'bg-amber-500/10 text-amber-900 dark:text-amber-300 border-amber-500/30', ring: 'text-amber-600', label: 'Wait' },
};

const BADGE_LABEL: Record<string, { text: string; cls: string }> = {
  LOWEST_TOTAL: { text: 'Lowest total', cls: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' },
  FASTEST: { text: 'Fastest', cls: 'bg-sky-500/10 text-sky-800 dark:text-sky-300' },
  BEST_RETURNS: { text: 'Best returns', cls: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' },
  TRUSTED: { text: 'Trusted seller', cls: 'bg-amber-500/10 text-amber-900 dark:text-amber-300' },
  COUPON: { text: 'Coupon', cls: 'bg-rose-500/10 text-rose-800 dark:text-rose-300' },
};

const money = (n: number) => `$${n.toFixed(2)}`;
const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export function ShopApp() {
  const [page, setPage] = useState<Page>('home');
  const [email, setEmail] = useState('');
  const [query, setQuery] = useState('');
  const [step, setStep] = useState(0); // 0 idle, 1-3 analyzing
  const [results, setResults] = useState<ShopResultsDTO | null>(null);
  const [recent, setRecent] = useState<ShopSearchSummaryDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('total');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [helpPrefill, setHelpPrefill] = useState<{ subject: string; searchId?: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  const loadRecent = useCallback(async (em: string) => {
    try {
      const r = await api.shopSearches(em || undefined);
      setRecent(r.searches);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    setMounted(true);
    // follow the suite's saved theme so BuyWise matches the rest of the app
    fetch('/api/settings').then((r) => r.json()).then((d: { settings?: { theme?: string } }) => {
      if (d.settings?.theme) setTheme(d.settings.theme);
    }).catch(() => { /* keep current theme */ });
    const stored = window.localStorage.getItem('bw_email') ?? '';
    setEmail(stored);
    void loadRecent(stored);
    // deep links: /?portal=shop&search=<id> and /?portal=shop&page=help
    const params = new URLSearchParams(window.location.search);
    const p = params.get('page');
    const sid = params.get('search');
    if (p === 'help') setPage('help');
    if (sid) {
      api.shopResults(sid).then((r) => {
        setResults(r);
        setPage('results');
      }).catch(() => null);
    }
    if (p || sid) window.history.replaceState({}, '', '/?portal=shop');
  }, [loadRecent]);

  const saveEmail = (em: string) => {
    setEmail(em);
    window.localStorage.setItem('bw_email', em);
  };

  const runSearch = async (q: string) => {
    if (!q.trim() || step > 0) return;
    setError(null);
    setResults(null);
    setExpanded(null);
    setPage('results');
    setStep(1);
    const t1 = setTimeout(() => setStep(2), 500);
    try {
      const r = await api.shopSearch(q.trim(), email || undefined);
      setStep(3);
      setTimeout(() => {
        setResults(r);
        setStep(0);
        void loadRecent(email);
      }, 350);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed — try again.');
      setStep(0);
      setPage('home');
    } finally {
      clearTimeout(t1);
    }
  };

  const openResults = async (id: string) => {
    try {
      const r = await api.shopResults(id);
      setResults(r);
      setSort('total');
      setExpanded(null);
      setPage('results');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that analysis.');
    }
  };

  const sortedQuotes = results
    ? [...results.quotes].sort((a, b) => (sort === 'total' ? a.total - b.total : sort === 'eta' ? a.etaDays - b.etaDays : b.rating - a.rating))
    : [];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <button type="button" onClick={() => { setPage('home'); setResults(null); }} className="flex items-center gap-2.5" aria-label="BuyWise home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="" className="h-9 w-9 rounded-xl shadow-sm" />
            <span className="text-left">
              <span className="block text-base font-extrabold leading-tight tracking-tight">BuyWise</span>
              <span className="block text-[10px] font-medium leading-tight text-muted-foreground">AI shopping copilot · where to buy, buy or wait</span>
            </span>
          </button>
          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="BuyWise sections">
            {([
              ['home', 'Search', ShoppingBag],
              ['watch', 'Watchlist', Timer],
              ['help', 'Help', Headset],
            ] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => { setPage(id); if (id === 'home') setResults(null); }}
                aria-current={page === id ? 'page' : undefined}
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors',
                  page === id ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : 'text-muted-foreground hover:bg-accent',
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {mounted && email && (
              <span className="hidden rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground sm:block">{email}</span>
            )}
            <button
              type="button"
              onClick={() => { const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next); void api.updateSettings({ theme: next }); }}
              aria-label="Toggle theme"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent"
            >
              {mounted && theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            <PortalLauncher current="shop" />
          </div>
        </div>
        {/* mobile nav */}
        <nav className="flex border-t border-border md:hidden" aria-label="BuyWise mobile sections">
          {([
            ['home', 'Search', ShoppingBag],
            ['watch', 'Watchlist', Timer],
            ['help', 'Help', Headset],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => { setPage(id); if (id === 'home') setResults(null); }}
              aria-current={page === id ? 'page' : undefined}
              className={cn('flex h-12 flex-1 items-center justify-center gap-1.5 text-xs font-semibold', page === id ? 'border-b-2 border-emerald-600 text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </nav>
      </header>

      {/* honesty banner (PRD §5.3) */}
      <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-center text-[11px] font-medium text-amber-800 dark:text-amber-300">
        Demo build — vendor data is modeled locally and refreshed on analysis; no requests are made to real stores.
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {error && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-800 dark:text-rose-300">
            <HelpCircle className="h-4 w-4 shrink-0" /> {error}
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error" className="ml-auto rounded p-1 hover:bg-rose-500/10"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}

        {page === 'home' && <Home query={query} setQuery={setQuery} onSearch={runSearch} recent={recent} onOpen={openResults} hasEmail={!!email} onSaveEmail={saveEmail} email={email} />}
        {page === 'results' && step > 0 && <Analyzing step={step} query={query} />}
        {page === 'results' && step === 0 && results && (
          <Results
            results={results}
            sort={sort} setSort={setSort}
            sortedQuotes={sortedQuotes}
            expanded={expanded} setExpanded={setExpanded}
            email={email} onSaveEmail={saveEmail}
            onDispute={(subject, searchId) => { setHelpPrefill({ subject, searchId }); setPage('help'); }}
            onSearch={runSearch}
          />
        )}
        {page === 'results' && step === 0 && !results && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Nothing analyzed yet — run a search from the <button type="button" className="font-semibold text-emerald-700 dark:text-emerald-300 underline" onClick={() => setPage('home')}>Search page</button>.
          </div>
        )}
        {page === 'watch' && <Watchlist key={email} email={email} onSaveEmail={saveEmail} onOpen={openResults} />}
        {page === 'help' && <Help key={email} email={email} onSaveEmail={saveEmail} prefill={helpPrefill} clearPrefill={() => setHelpPrefill(null)} />}
      </main>

      <footer className="mt-auto border-t border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-4 text-[11px] text-muted-foreground sm:flex-row">
          <p>BuyWise · part of the Tactical Arbitrage platform · verdicts explain both sides, always.</p>
          <p>Demo data is fictional-but-realistic; no store is contacted.</p>
        </div>
      </footer>
    </div>
  );
}

// ── Home (§12.1) ────────────────────────────────────────────────────────────

function Home({
  query, setQuery, onSearch, recent, onOpen, hasEmail, onSaveEmail, email,
}: {
  query: string;
  setQuery: (q: string) => void;
  onSearch: (q: string) => void;
  recent: ShopSearchSummaryDTO[];
  onOpen: (id: string) => void;
  hasEmail: boolean;
  onSaveEmail: (e: string) => void;
  email: string;
}) {
  const [emailDraft, setEmailDraft] = useState(email);
  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="mx-auto max-w-3xl pt-6 text-center">
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          <BadgeCheck className="h-3.5 w-3.5" /> One search · every vendor · an honest verdict
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
          Stop overpaying.<br />
          <span className="text-emerald-600 dark:text-emerald-400">Buy with reasons. Wait with reasons.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
          Tell us what you&apos;re shopping for. We compare real totals across vendors — shipping and tax included — then our AI tells you whether to buy now or wait, and shows its reasoning both ways.
        </p>
        <form
          className="mx-auto mt-6 flex max-w-2xl flex-col gap-2 sm:flex-row"
          onSubmit={(e) => { e.preventDefault(); onSearch(query); }}
        >
          <label className="sr-only" htmlFor="bw-search">What are you shopping for?</label>
          <input
            id="bw-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What are you shopping for? e.g. wireless earbuds"
            className="h-12 flex-1 rounded-full border border-border bg-card px-5 text-sm shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
          />
          <button
            type="submit"
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-600 px-7 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-500 active:scale-[0.98]"
          >
            <Search className="h-4 w-4" /> Analyze prices
          </button>
        </form>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => { setQuery(ex); onSearch(ex); }}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-emerald-500/50 hover:text-emerald-600 dark:hover:text-emerald-300"
            >
              {ex}
            </button>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section aria-label="How BuyWise works" className="grid gap-4 sm:grid-cols-3">
        {([
          ['1', 'We fetch the vendors', 'Your product is compared across major retailers and marketplace sellers — totals include shipping and estimated tax.', PackageCheck],
          ['2', 'We measure fairness', 'Today\'s best price is placed inside its 90-day range, with trends, stock, coupons, and seller trust factored in.', TrendingDown],
          ['3', 'You get both sides', 'A Buy now / Wait verdict with reasons for buying AND reasons for waiting — you make the final call.', ShieldCheck],
        ] as const).map(([n, title, body, Icon]) => (
          <div key={n} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><Icon className="h-5 w-5" /></span>
              <p className="text-sm font-bold">{n}. {title}</p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>

      {/* email scope */}
      {!hasEmail && (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm" aria-label="Save your history">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-sm font-bold">Keep your history &amp; watches</p>
              <p className="text-xs text-muted-foreground">Optional — add your email and your searches, verdicts, and price watches stay linked to it. Nothing else is stored.</p>
            </div>
            <form className="flex w-full gap-2 sm:w-auto" onSubmit={(e) => { e.preventDefault(); if (emailDraft.includes('@')) onSaveEmail(emailDraft.trim()); }}>
              <input
                type="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email for history and watches"
                className="h-10 flex-1 rounded-lg border border-border px-3 text-sm outline-none focus:border-emerald-500 sm:w-56"
              />
              <button type="submit" className="h-10 rounded-lg bg-foreground text-background px-4 text-xs font-bold text-white hover:bg-foreground/80">Save</button>
            </form>
          </div>
        </section>
      )}

      {/* recent searches */}
      {recent.length > 0 && (
        <section aria-label="Recent searches">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Recent analyses</h2>
            {hasEmail && <span className="text-xs text-muted-foreground">scoped to {email}</span>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.slice(0, 6).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onOpen(s.id)}
                className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-emerald-500/50 hover:shadow"
              >
                <ProductImage imageKey={s.imageUrl} title={s.productName} category={s.category} className="h-12 w-12 text-xs" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-semibold leading-snug">{s.productName}</span>
                  <span className="mt-1.5 flex items-center gap-1.5">
                    <VerdictChip verdict={s.verdict} small />
                    <span className="text-xs text-muted-foreground">{s.quoteCount} vendors · {ago(s.createdAt)}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Analyzing (§12.1 — honest progress) ──────────────────────────────────────

function Analyzing({ step, query }: { step: number; query: string }) {
  const steps = ['Fetching vendor prices', 'Building the comparison', 'Running the AI verdict'];
  return (
    <div className="mx-auto max-w-xl py-14 text-center" role="status" aria-live="polite">
      <p className="text-sm font-medium text-muted-foreground">Analyzing</p>
      <p className="mt-1 text-xl font-bold">{query || 'your product'}</p>
      <div className="mt-8 space-y-3 text-left">
        {steps.map((label, i) => {
          const idx = i + 1;
          const state = step > idx ? 'done' : step === idx ? 'active' : 'pending';
          return (
            <div key={label} className={cn('flex items-center gap-3 rounded-xl border p-3.5', state === 'done' ? 'border-emerald-500/30 bg-emerald-500/10' : state === 'active' ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-border bg-card')}>
              {state === 'done' ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : state === 'active' ? <Loader2 className="h-5 w-5 animate-spin text-emerald-600" /> : <span className="h-5 w-5 rounded-full border-2 border-border" />}
              <span className={cn('text-sm font-semibold', state === 'pending' ? 'text-muted-foreground' : 'text-foreground')}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Results (§12.1 — verdict hero, dual ledger, comparison) ────────────────

function Results({
  results, sort, setSort, sortedQuotes, expanded, setExpanded, email, onSaveEmail, onDispute, onSearch,
}: {
  results: ShopResultsDTO;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  sortedQuotes: ShopResultsDTO['quotes'];
  expanded: string | null;
  setExpanded: (v: string | null) => void;
  email: string;
  onSaveEmail: (e: string) => void;
  onDispute: (subject: string, searchId: string) => void;
  onSearch: (q: string) => void;
}) {
  const s = results.search;
  const v = VERDICT_STYLE[s.verdict] ?? VERDICT_STYLE.BUY;
  const savings = s.worstTotal - s.bestTotal;
  const savingsPct = Math.round((savings / s.worstTotal) * 100);
  const bestQuote = results.quotes.filter((q) => q.inStock).sort((a, b) => a.total - b.total)[0];

  return (
    <div className="space-y-5">
      {/* Verdict hero */}
      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm" aria-label="AI verdict">
        <div className="flex flex-col gap-5 p-6 md:flex-row md:items-center">
          <ProductImage imageKey={s.imageUrl} title={s.productName} category={s.category} className="h-20 w-20 rounded-2xl text-base" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.brand} · {s.category}</p>
            <h1 className="text-xl font-extrabold leading-snug">{s.productName}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {results.quotes.length} vendors compared · reference price {money(s.msrp)} · analyzed {ago(s.createdAt)} by <span className="font-semibold text-foreground">{s.engineLabel}</span>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-extrabold', v.chip)}>
                {s.verdict === 'WAIT' ? <Timer className="h-4 w-4" /> : <BadgeCheck className="h-4 w-4" />} {v.label}
              </span>
              <ConfidenceRing value={s.confidence} cls={v.ring} />
              {bestQuote && (
                <span className="rounded-full bg-secondary px-3 py-1 text-sm font-bold">
                  Best total <span className="text-emerald-700 dark:text-emerald-300">{money(bestQuote.total)}</span> at {bestQuote.vendor}
                </span>
              )}
              {savings > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-900 dark:text-amber-300" title="Computed from this comparison only">
                  <Tag className="h-3.5 w-3.5" /> You save {money(savings)} ({savingsPct}%) vs the priciest vendor here
                </span>
              )}
            </div>
          </div>
          <div className="md:w-64">
            <FairMeter percentile={s.fairPercentile} low={s.priceLow90} high={s.priceHigh90} />
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              30-day trend{' '}
              <span className={cn('font-bold', s.trendPct < 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300')}>
                {s.trendPct < 0 ? '▼' : '▲'} {Math.abs(s.trendPct).toFixed(1)}%
              </span>
              {s.saleInDays != null && <> · sale window in ~{s.saleInDays}d</>}
            </p>
          </div>
        </div>
      </section>

      {/* Dual reasons ledger (PRD §7.2 — always both sides) */}
      <section className="grid items-start gap-4 md:grid-cols-2" aria-label="Reasons for buying and waiting">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-5">
          <p className="flex items-center gap-2 text-sm font-extrabold text-emerald-900 dark:text-emerald-300"><TrendingUp className="h-4 w-4" /> Why buying now makes sense</p>
          <ul className="mt-3 space-y-2">
            {s.buyReasons.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground/90">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {r}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-5">
          <p className="flex items-center gap-2 text-sm font-extrabold text-amber-900 dark:text-amber-300"><Timer className="h-4 w-4" /> Why you might still wait</p>
          <ul className="mt-3 space-y-2">
            {s.waitReasons.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground/90">
                <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-amber-500" /> {r}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* AI narrative */}
      <section className="rounded-2xl border border-emerald-500/30 bg-card p-5" aria-label="AI narrative">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300"><Radar className="h-4 w-4" /> What our AI found</p>
        <p className="mt-2 text-sm leading-relaxed text-foreground">{s.narrative}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">Engine: {s.engineLabel}</span>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">Analysis took {s.durationMs} ms</span>
          <button type="button" onClick={() => onDispute(`Dispute: verdict on ${s.productName}`, s.id)} className="ml-auto text-xs font-bold text-emerald-700 dark:text-emerald-300 underline hover:text-emerald-800 dark:hover:text-emerald-200">
            Dispute this analysis
          </button>
          <button type="button" onClick={() => onSearch(s.query)} className="text-xs font-bold text-muted-foreground underline hover:text-foreground">
            Refresh quotes
          </button>
        </div>
      </section>

      {/* Vendor comparison */}
      <section aria-label="Vendor comparison" className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
          <h2 className="text-lg font-bold">Vendor comparison</h2>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Sort by</span>
            {(['total', 'eta', 'rating'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                aria-pressed={sort === k}
                className={cn('rounded-full px-3 py-1.5 font-semibold capitalize transition', sort === k ? 'bg-emerald-600 text-white' : 'bg-secondary text-muted-foreground hover:bg-accent')}
              >
                {k === 'eta' ? 'delivery' : k}
              </button>
            ))}
          </div>
        </div>

        {/* desktop table */}
        <div className="hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Vendor</th>
                <th className="px-4 py-2.5 font-semibold">Price</th>
                <th className="px-4 py-2.5 font-semibold">Ship + tax</th>
                <th className="px-4 py-2.5 font-semibold">Total</th>
                <th className="px-4 py-2.5 font-semibold">Delivery</th>
                <th className="px-4 py-2.5 font-semibold">Trend 90d</th>
                <th className="px-4 py-2.5 font-semibold">Trust</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {sortedQuotes.map((q) => (
                <QuoteRow key={q.vendor} q={q} expanded={expanded === q.vendor} onToggle={() => setExpanded(expanded === q.vendor ? null : q.vendor)} />
              ))}
            </tbody>
          </table>
        </div>

        {/* mobile cards */}
        <div className="space-y-3 p-3 md:hidden">
          {sortedQuotes.map((q) => (
            <QuoteCard key={q.vendor} q={q} />
          ))}
        </div>
      </section>

      <WatchCard searchId={s.id} bestTotal={s.bestTotal} email={email} onSaveEmail={onSaveEmail} productName={s.productName} />
    </div>
  );
}

function VerdictChip({ verdict, small }: { verdict: string; small?: boolean }) {
  const v = VERDICT_STYLE[verdict] ?? VERDICT_STYLE.BUY;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border font-extrabold', v.chip, small ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-sm')}>
      {v.label}
    </span>
  );
}

function ConfidenceRing({ value, cls }: { value: number; cls: string }) {
  const r = 11;
  const c = 2 * Math.PI * r;
  return (
    <span className="inline-flex items-center gap-1.5" title={`Confidence ${value}/100`}>
      <svg width="30" height="30" viewBox="0 0 30 30" className={cls} aria-hidden="true">
        <circle cx="15" cy="15" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="4" />
        <circle cx="15" cy="15" r={r} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(value / 100) * c} ${c}`} transform="rotate(-90 15 15)" />
      </svg>
      <span className={cn('text-xs font-bold', cls)}>{value}%</span>
    </span>
  );
}

function FairMeter({ percentile, low, high }: { percentile: number; low: number; high: number }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        <span>Fair-price meter</span>
        <span>{percentile}th pctile</span>
      </div>
      <div className="relative mt-1.5 h-3 rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-400" role="img" aria-label={`Best price in the ${percentile}th percentile of the 90-day range`}>
        <span className="absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground text-background shadow" style={{ left: `${Math.min(97, Math.max(3, percentile))}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-semibold text-muted-foreground">
        <span>90d low {money(low)}</span>
        <span>high {money(high)}</span>
      </div>
    </div>
  );
}

function Sparkline({ history }: { history: { d: string; p: number }[] }) {
  const pts = history.slice(-45);
  if (pts.length < 2) return null;
  const min = Math.min(...pts.map((p) => p.p));
  const max = Math.max(...pts.map((p) => p.p));
  const w = 110;
  const h = 28;
  const path = pts.map((p, i) => `${(i / (pts.length - 1)) * w},${h - ((p.p - min) / Math.max(max - min, 0.01)) * (h - 4) - 2}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="overflow-visible">
      <polyline points={path} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function QuoteRow({ q, expanded, onToggle }: { q: ShopResultsDTO['quotes'][number]; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className={cn('border-b border-border transition-colors hover:bg-accent', !q.inStock && 'opacity-50')}>
        <td className="px-4 py-3">
          <p className="font-bold">{q.vendor}</p>
          <p className="text-[11px] text-muted-foreground">{q.vendorType === 'MARKETPLACE' ? 'Marketplace seller' : `${q.tier}-tier retailer`}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {q.badges.map((b) => BADGE_LABEL[b] && (
              <span key={b} className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold', BADGE_LABEL[b].cls)}>{BADGE_LABEL[b].text}</span>
            ))}
          </div>
        </td>
        <td className="px-4 py-3">
          <p className="font-semibold">{money(q.price)}</p>
          {q.couponText && <p className="text-[10px] font-semibold text-rose-600">{q.couponText}</p>}
          <p className="text-[10px] text-muted-foreground">{q.discountPct.toFixed(0)}% off list</p>
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">{money(q.shipping)} + {money(q.tax)}</td>
        <td className="px-4 py-3">
          <p className="text-base font-extrabold text-foreground">{money(q.total)}</p>
          {!q.inStock && <p className="text-[10px] font-bold text-rose-600">Out of stock</p>}
          {q.inStock && q.stockLeft != null && <p className="text-[10px] font-bold text-amber-600">Only {q.stockLeft} left</p>}
        </td>
        <td className="px-4 py-3 text-xs">{q.etaDays === 1 ? 'Tomorrow' : `${q.etaDays} days`}</td>
        <td className="px-4 py-3">
          <span className={cn('flex items-center gap-1 text-xs font-semibold', q.trendPct <= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600')}>
            {q.trendPct <= 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
            {Math.abs(q.trendPct).toFixed(1)}%
          </span>
        </td>
        <td className="px-4 py-3">
          <p className="flex items-center gap-1 text-xs font-bold"><Star className="h-3 w-3 fill-amber-500 text-amber-500" /> {q.rating.toFixed(1)} <span className="font-normal text-muted-foreground">({(q.reviews / 1000).toFixed(1)}k)</span></p>
          <p className="text-[10px] text-muted-foreground">{q.returnDays}-day returns · {q.warrantyMonths}mo warranty</p>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1.5">
            <span className="text-muted-foreground" title="90-day price trend"><Sparkline history={q.history} /></span>
            <button type="button" onClick={onToggle} aria-expanded={expanded} aria-label={`Details for ${q.vendor}`} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-secondary">
          <td colSpan={8} className="px-4 py-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Price breakdown</p>
                <div className="mt-1 space-y-0.5 text-xs text-foreground">
                  <p>Item: {money(q.price)}</p>
                  <p>Shipping: {money(q.shipping)}</p>
                  <p>Est. tax (7%): {money(q.tax)}</p>
                  <p className="border-t pt-0.5 font-bold">Total: {money(q.total)}</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Trust strip</p>
                <div className="mt-1 space-y-0.5 text-xs text-foreground">
                  <p>Rating: {q.rating.toFixed(1)} / 5 · {q.reviews.toLocaleString()} reviews</p>
                  <p>Returns: {q.returnDays} days</p>
                  <p>Warranty: {q.warrantyMonths} months</p>
                  <p>Delivery: {q.etaDays} day{q.etaDays > 1 ? 's' : ''}</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">This vendor&apos;s 90-day price</p>
                <div className="mt-2 text-emerald-600"><Sparkline history={q.history} /></div>
                <p className="mt-1 text-[10px] text-muted-foreground">Current {money(q.price)} · 30d {q.trendPct <= 0 ? 'down' : 'up'} {Math.abs(q.trendPct).toFixed(1)}%</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function QuoteCard({ q }: { q: ShopResultsDTO['quotes'][number] }) {
  return (
    <div className={cn('rounded-xl border p-3.5', q.inStock ? 'border-border bg-card' : 'border-border bg-secondary opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold">{q.vendor}</p>
          <p className="text-[10px] text-muted-foreground">{q.vendorType === 'MARKETPLACE' ? 'Marketplace' : `${q.tier}-tier`}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-extrabold">{money(q.total)}</p>
          <p className="text-[10px] text-muted-foreground">{money(q.price)} + {money(q.shipping)} ship + {money(q.tax)} tax</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {q.badges.map((b) => BADGE_LABEL[b] && (
          <span key={b} className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold', BADGE_LABEL[b].cls)}>{BADGE_LABEL[b].text}</span>
        ))}
        {!q.inStock && <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 dark:text-rose-300">Out of stock</span>}
        {q.inStock && q.stockLeft != null && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:text-amber-300">Only {q.stockLeft} left</span>}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><Truck className="h-3 w-3" /> {q.etaDays === 1 ? 'Tomorrow' : `${q.etaDays} days`}</span>
        <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-amber-500 text-amber-500" /> {q.rating.toFixed(1)} ({(q.reviews / 1000).toFixed(1)}k)</span>
        <span>{q.returnDays}-day returns</span>
        <span className={cn('flex items-center gap-1 font-semibold', q.trendPct <= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600')}>
          {q.trendPct <= 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />} {Math.abs(q.trendPct).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function WatchCard({ searchId, bestTotal, email, onSaveEmail, productName }: { searchId: string; bestTotal: number; email: string; onSaveEmail: (e: string) => void; productName: string }) {
  const [target, setTarget] = useState(String(Math.round(bestTotal * 0.95 * 100) / 100));
  const [emailDraft, setEmailDraft] = useState(email);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  const save = async () => {
    const em = emailDraft.trim();
    if (!em.includes('@')) { setState('error'); return; }
    onSaveEmail(em);
    setState('busy');
    try {
      await api.shopWatchCreate({ searchId, email: em, targetPrice: Number(target) });
      setState('done');
    } catch {
      setState('error');
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm" aria-label="Price watch">
      <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
        <div className="flex-1">
          <p className="flex items-center gap-2 text-sm font-bold"><Timer className="h-4 w-4 text-emerald-600" /> Watch this price</p>
          <p className="text-xs text-muted-foreground">Tell us your target total for {productName}. We track it against the vendors in this comparison and flag it in your watchlist.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="bw-target">Target total price</label>
            <input id="bw-target" value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" aria-label="Target total price" className="h-10 w-28 rounded-lg border border-border px-3 text-sm outline-none focus:border-emerald-500" />
            <label className="sr-only" htmlFor="bw-email">Email</label>
            <input id="bw-email" type="email" value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} placeholder="you@example.com" aria-label="Email for the watch" className="h-10 w-52 rounded-lg border border-border px-3 text-sm outline-none focus:border-emerald-500" />
          </div>
          <button type="button" onClick={save} disabled={state === 'busy'} className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-60">
            {state === 'busy' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Timer className="h-3.5 w-3.5" />}
            {state === 'done' ? 'Watching ✓' : 'Start watching'}
          </button>
        </div>
      </div>
      {state === 'error' && <p className="mt-2 text-xs font-semibold text-rose-600">Enter a valid email and target price, then try again.</p>}
      {state === 'done' && <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Watch saved — see it under Watchlist.</p>}
    </section>
  );
}

// ── Watchlist (FR-4) ────────────────────────────────────────────────────────

function Watchlist({ email, onSaveEmail, onOpen }: { email: string; onSaveEmail: (e: string) => void; onOpen: (id: string) => void }) {
  const [watches, setWatches] = useState<{ id: string; targetPrice: number; search: { id: string; productName: string; bestTotal: number; verdict: string; imageUrl: string; createdAt: string } }[]>([]);
  const [emailDraft, setEmailDraft] = useState(email);
  const [loaded, setLoaded] = useState(false);

  // mount-only load (remounted via key={email} when the shopper switches identity)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (email) {
        try {
          const r = await api.shopWatches(email);
          if (!cancelled) setWatches(r.watches);
        } catch {
          if (!cancelled) setWatches([]);
        }
      } else if (!cancelled) {
        setWatches([]);
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [email]);

  const remove = async (id: string) => {
    await api.shopWatchDelete(id).catch(() => null);
    setWatches((w) => w.filter((x) => x.id !== id));
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Watchlist</h1>
        <p className="text-sm text-muted-foreground">Products you asked us to keep an eye on, with current best totals vs your target.</p>
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); onSaveEmail(emailDraft.trim()); }}>
        <input type="email" value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} placeholder="you@example.com" aria-label="Email to load watches for" className="h-11 flex-1 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-emerald-500 sm:max-w-xs" />
        <button type="submit" className="h-11 rounded-lg bg-foreground text-background px-5 text-xs font-bold text-white hover:bg-foreground/80">Load</button>
      </form>

      {loaded && watches.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No watches yet. Run an analysis and set a target price — we&apos;ll keep score here.
        </div>
      )}
      <div className="space-y-3">
        {watches.map((w) => {
          const pct = Math.min(100, Math.round((w.search.bestTotal / Math.max(w.targetPrice, 0.01)) * 100));
          const hit = w.search.bestTotal <= w.targetPrice;
          return (
            <div key={w.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center">
              <ProductImage imageKey={w.search.imageUrl} title={w.search.productName} category="—" className="h-12 w-12 text-xs" />
              <button type="button" onClick={() => onOpen(w.search.id)} className="min-w-0 flex-1 text-left">
                <p className="line-clamp-1 text-sm font-bold hover:text-emerald-600 dark:hover:text-emerald-300">{w.search.productName}</p>
                <p className="text-xs text-muted-foreground">target {money(w.targetPrice)} · current best {money(w.search.bestTotal)} · added {ago(w.search.createdAt)}</p>
                <div className="mt-2 h-2 rounded-full bg-secondary">
                  <div className={cn('h-2 rounded-full', hit ? 'bg-emerald-500' : 'bg-emerald-500')} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </button>
              <div className="flex items-center gap-2">
                {hit ? <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">TARGET MET</span> : <VerdictChip verdict={w.search.verdict} small />}
                <button type="button" onClick={() => remove(w.id)} aria-label={`Remove watch for ${w.search.productName}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Help (FR-6 — consumer care path) ────────────────────────────────────────

const HELP_CATEGORIES = [
  { id: 'SHOPPING', label: 'Verdict or comparison', desc: 'Dispute a verdict, question prices' },
  { id: 'OTHER', label: 'Something else', desc: 'Anything not listed here' },
  { id: 'ACCOUNT', label: 'Watches & email', desc: 'Watchlist or email issues' },
];

function Help({ email, onSaveEmail, prefill, clearPrefill }: { email: string; onSaveEmail: (e: string) => void; prefill: { subject: string; searchId?: string } | null; clearPrefill: () => void }) {
  const [name, setName] = useState('');
  const [emailDraft, setEmailDraft] = useState(email);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('SHOPPING');
  const [description, setDescription] = useState('');
  const [attachId, setAttachId] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdRef, setCreatedRef] = useState<string | null>(null);
  const [tickets, setTickets] = useState<{ id: string; ref: string; subject: string; status: string; createdAt: string }[]>([]);
  const [openTicket, setOpenTicket] = useState<{ id: string; ref: string; subject: string; status: string; messages: { id: string; author: string; authorRole: string; body: string; createdAt: string }[] } | null>(null);
  const [reply, setReply] = useState('');
  const [csatGiven, setCsatGiven] = useState(false);
  useEffect(() => setEmailDraft(email), [email]);

  useEffect(() => {
    if (prefill) {
      setSubject(prefill.subject);
      setCategory('SHOPPING');
      setAttachId(prefill.searchId ?? null);
      clearPrefill();
    }
  }, [prefill, clearPrefill]);

  const loadTickets = useCallback(async (em: string) => {
    await Promise.resolve();
    if (!em) { setTickets([]); return; }
    try {
      const r = await api.careTickets({ email: em });
      setTickets(r.tickets.map((t) => ({ id: t.id, ref: t.ref, subject: t.subject, status: t.status, createdAt: t.createdAt })));
    } catch { setTickets([]); }
  }, []);

  useEffect(() => {
    void loadTickets(email);
  }, [email, loadTickets]);

  const submit = async () => {
    if (!subject.trim() || !description.trim() || !emailDraft.includes('@')) return;
    onSaveEmail(emailDraft.trim());
    setState('busy');
    setSubmitError(null);
    try {
      const r = await api.createTicket({
        subject: subject.trim(), category, description: description.trim(),
        customerType: 'CONSUMER', customerName: name.trim() || 'BuyWise Shopper', customerEmail: emailDraft.trim(),
        consumerSearchId: attachId ?? undefined,
      });
      setCreatedRef(r.ticket.ref);
      setState('done');
      setSubject(''); setDescription(''); setAttachId(null);
      void loadTickets(emailDraft.trim());
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not submit — try again.');
    } finally {
      setState('idle');
    }
  };

  const openThread = async (id: string) => {
    setCsatGiven(false);
    try {
      const d = await api.ticket360(id);
      setOpenTicket({ id, ref: d.ticket.ref, subject: d.ticket.subject, status: d.ticket.status, messages: d.messages.filter((m) => !m.internal) });
    } catch { /* ignore */ }
  };

  const sendReply = async () => {
    if (!openTicket || !reply.trim()) return;
    await api.replyTicket(openTicket.id, { body: reply, role: 'CUSTOMER' }).catch(() => null);
    setReply('');
    void openThread(openTicket.id);
  };

  const giveCsat = async (stars: number) => {
    if (!openTicket) return;
    await api.updateTicket(openTicket.id, { csat: stars }).catch(() => null);
    setCsatGiven(true);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold">Help &amp; support</h1>
          <p className="text-sm text-muted-foreground">Complaints and questions go straight to our care team — they see the exact comparison you saw.</p>
        </div>

        {state === 'done' && createdRef && (
          <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" /> Ticket {createdRef} created — the care team replies within the SLA window shown in your ticket list.
          </div>
        )}

        <section className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm" aria-label="New ticket">
          <p className="text-sm font-bold">Raise a ticket</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {HELP_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                aria-pressed={category === c.id}
                className={cn('rounded-xl border p-3 text-left transition', category === c.id ? 'border-emerald-400 bg-emerald-500/10' : 'border-border hover:border-border')}
              >
                <p className="text-xs font-bold">{c.label}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{c.desc}</p>
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" aria-label="Your name" className="h-11 rounded-lg border border-border px-3 text-sm outline-none focus:border-emerald-500" />
            <input type="email" value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} placeholder="Email (required)" aria-label="Your email" className="h-11 rounded-lg border border-border px-3 text-sm outline-none focus:border-emerald-500" />
          </div>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject — what went wrong or what do you want to know?" aria-label="Subject" className="h-11 w-full rounded-lg border border-border px-3 text-sm outline-none focus:border-emerald-500" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Tell us more… if this is about a verdict, tell us which part felt wrong." aria-label="Description" className="w-full rounded-lg border border-border p-3 text-sm outline-none focus:border-emerald-500" />
          {attachId && (
            <p className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              <BadgePercent className="h-3.5 w-3.5" /> A comparison is attached to this ticket.{' '}
              <button type="button" onClick={() => setAttachId(null)} className="ml-auto font-bold underline">Remove</button>
            </p>
          )}
          <button type="button" onClick={submit} disabled={state === 'busy' || !subject.trim() || !description.trim() || !emailDraft.includes('@')} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50 sm:w-auto sm:px-6">
            {state === 'busy' && <Loader2 className="h-4 w-4 animate-spin" />} Submit to care team
          </button>
          {submitError && <p className="text-xs font-semibold text-rose-600" role="alert">{submitError}</p>}
        </section>
      </div>

      {/* my tickets */}
      <aside className="space-y-3" aria-label="My tickets">
        <p className="text-sm font-bold">My tickets {email && <span className="font-normal text-muted-foreground">· {email}</span>}</p>
        {tickets.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">Tickets you raise will appear here with the team&apos;s replies.</p>
        )}
        {tickets.map((t) => (
          <button key={t.id} type="button" onClick={() => openThread(t.id)} className="w-full rounded-xl border border-border bg-card p-3.5 text-left shadow-sm transition hover:border-emerald-500/50">
            <p className="font-mono text-[10px] text-muted-foreground">{t.ref} · {ago(t.createdAt)}</p>
            <p className="line-clamp-2 text-sm font-semibold">{t.subject}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t.status.replace('_', ' ')}</p>
          </button>
        ))}

        {openTicket && (
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm" aria-label="Ticket thread">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-[10px] text-muted-foreground">{openTicket.ref}</p>
                <p className="text-sm font-bold">{openTicket.subject}</p>
              </div>
              <button type="button" onClick={() => setOpenTicket(null)} aria-label="Close thread" className="rounded p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
              {openTicket.messages.map((m) => (
                <div key={m.id} className={cn('max-w-[90%] rounded-lg p-2.5 text-xs', m.authorRole === 'CUSTOMER' ? 'mr-auto bg-secondary' : 'ml-auto bg-emerald-500/10 text-foreground')}>
                  <p className="mb-0.5 text-[10px] font-bold text-muted-foreground">{m.author} · {ago(m.createdAt)}</p>
                  {m.body}
                </div>
              ))}
            </div>
            {!['RESOLVED', 'CLOSED'].includes(openTicket.status) ? (
              <div className="mt-3 space-y-2">
                <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Write a reply…" aria-label="Reply" className="w-full rounded-lg border border-border p-2 text-xs outline-none focus:border-emerald-500" />
                <button type="button" onClick={sendReply} className="h-9 w-full rounded-lg bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-500">Send reply</button>
              </div>
            ) : (
              <div className="mt-3 rounded-lg bg-secondary p-3 text-center">
                <p className="text-xs font-semibold text-muted-foreground">{csatGiven ? 'Thanks for rating this ticket!' : 'Was this resolved well?'}</p>
                {!csatGiven && (
                  <div className="mt-1.5 flex justify-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" onClick={() => giveCsat(n)} aria-label={`Rate ${n} stars`} className="rounded p-1 hover:bg-amber-500/10">
                        <Star className={cn('h-5 w-5', n <= 3 ? 'fill-amber-500 text-amber-500' : 'fill-amber-500 text-amber-500')} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
