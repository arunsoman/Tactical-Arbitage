# Tactical Arbitrage (TA) — AI-First, Mobile-First OA Sourcing Platform

Web-based product-sourcing platform for **online arbitrage (OA) sellers**, built from
**PRD v2.2 (AI-First, Mobile-First)** — which supersedes the earlier engineering-review
draft. It implements the core value loop:

> **Scan → Match → Calculate → Filter → AI-Rank → Act**

— continuously "scans" a network of 67 real US retail sites (Walmart, Best Buy, Target,
Costco, Home Depot, Chewy, Walgreens, CVS, Staples, …), matches retailer products to a
fictional-but-realistic Amazon catalog, computes **true net profit** after all Amazon
fees, then an **evidence-linked AI layer** ranks, explains, and learns from every outcome.

## What v2.2 adds (AI-first + mobile-first)

| PRD v2.2 | Feature | Where |
|---|---|---|
| §4 US-1/US-2 | **AI Picks** default home: thumb-scrollable ranked cards, one-line evidence reason always visible, key numbers up top | `src/components/ta/picks-view.tsx`, `pick-card.tsx` |
| §4 US-2/US-3 | **Deal Detail**: single-column mobile sheet, progressive disclosure (one-line reason → full evidence chain), sticky bottom CTA bar, fee breakdown, 90-day history + breakeven line | `src/components/ta/deal-detail-sheet.tsx` |
| §1/§5 | **Calibrated confidence**: win probability maps to observed outcome rates (Laplace-smoothed bins, global-prior cold start, shrinkage for sparse bins) | `src/lib/ta/ai/ranking.ts` |
| §1 | **Evidence-linked reasons**: every claim traces to data (profit ÷ landed cost, 30-day price position, BSR demand est., personalization record) — no black box | `ranking.ts → buildReasons` |
| §4 US-5 | **NL deal search**: deterministic grammar (category, price, ROI, confidence, recency, brand, retailer, BSR, flags, sort), voice input (Web Speech API), context-carrying refinements, honest `unmatched` chips | `src/lib/ta/ai/nl.ts`, `search-view.tsx`, `use-voice.ts` |
| §4 US-4/§5 | **Trust & override**: dispute, override, permanent suppression (brand/category/retailer/ASIN/IP/return/gating), large touch targets, immutable audit trail | `trust-sheet.tsx`, `/api/trust`, `/api/audit` |
| §5 | **Outcome capture**: bought/returned/partial/multi-unit/cancelled, mobile quick-entry with smart defaults, imputed flag, pending prompts; pipeline state syncs from outcomes | `outcome-sheet.tsx`, `/api/outcomes` |
| §5 | **Learning loop**: outcomes → calibration + category personalization (gated 20–30 weak / 100+ strong) + account health | `ai/ranking.ts`, `ai/health.ts` |
| §5 | **Account health > ROI**: predictive score with visible reasons, enforcement ladder (IP → gated/hazmat exclusions → forced safe mode), suppression suggestions | `ai/health.ts` |
| §4 US-6/§7 | **Notifications**: reason + deep link (`/?deal=<id>`), mobile sheet lands directly on reasoning; snapshot cache for instant cold starts, stale fallback | `ai/picks.ts`, `alerts-view.tsx` |
| §5 | **Online evaluation**: NDCG@10, Precision@10, AI vs non-AI win rate, ROI lift, drift alerts with fire-once notifications | `ai/eval.ts`, `ai-status-view.tsx` |
| §3/§5 | **Latency & cost instrumentation**: rank/reason/NL p95 vs PRD budgets (2s/5s), cost per recommendation, tiered-model note | `ai/instrument.ts`, `ai-status-view.tsx` |
| §5 | **VA / Team**: Owner/Manager/VA roles, approval workflow (VA suppressions & buys need sign-off), immutable audit trail, mobile-first | `team-view.tsx`, `/api/team`, `/api/approvals` |
| §10 | **Mobile-first shell**: bottom tab bar (Picks/Ask/Pipeline/Alerts/More), ≥44pt touch targets, safe-area insets, 320px fluid, no horizontal scroll | `ta-app.tsx` |
| §10 | **Dark mode from day one** (default) + light theme, persisted per settings | `globals.css`, `theme-provider.tsx` |

## What v1.0 adds (Ops & Customer Care — separate PRDs)

| PRD | Feature | Where |
|---|---|---|
| TA-PRD-OPS-1.0 §5 | **LLM Registry**: providers with masked-only key capture, model enrollment (capabilities RANK/REASON/NL/EVAL, PRIMARY/FALLBACK tiers, $/1M token prices), capability routing chains, capability-appropriate connection probes with latency/cost evidence, re-test staleness badges | `src/lib/ta/ops.ts`, `ops-view.tsx`, `/api/ops/llms/*` |
| TA-PRD-OPS-1.0 §6 | **Supplier connectors**: registry (adapter/endpoint/auth/rate-limit/cadence), five-test suite (CONNECTIVITY, SCHEMA, SAMPLE_CRAWL, MATCH_PROBE, FEE_CONFIG) with per-check details, gated lifecycle DRAFT→TESTING→CANARY→LIVE (+PAUSED/RETIRED), server-side gate engine (24h validity, error-rate + canary-health thresholds), promotion dialog with live pass/fail checklist, LIVE side effects on the linked Retailer, pause/retire with rollback | `/api/ops/connectors/*`, `ops-view.tsx` |
| TA-PRD-OPS-1.0 §7 | **Ops Overview**: system KPIs (deal store, fresh %, scan success, rank/reason p95 vs 2s/5s budgets), connector SLA board, LLM fleet health + probe spend, recent ops activity, append-only admin audit trail | `/api/ops/overview`, `ops-view.tsx` |
| TA-PRD-CARE-1.0 §5 | **Customer support (mobile-first)**: categorized ticket creation with deal/retailer entity attachment, My Tickets, plain-language SLA expectations, thread replies, reopen within window, 1–5 CSAT rating | `support-view.tsx`, `/api/care/tickets` |
| TA-PRD-CARE-1.0 §6 | **Care Console + Ticket 360**: SLA-urgency queue (breach-first sort, filters), and per-ticket server-assembled dashboard — customer profile (plan/billing/health), usage footprint (leads/scans/pipeline/outcomes/AI win rate), referenced deal with FULL fee economics + 90-day range + "open in Deal Finder", past tickets, event timeline, thread with internal notes (never shown to customers) + canned responses | `care-view.tsx`, `/api/care/tickets/[id]` |
| TA-PRD-CARE-1.0 §6.4–7 | **Workflow & automation**: status machine (OPEN→IN_PROGRESS→WAITING_CUSTOMER→RESOLVED→CLOSED) with transition validation, P1/P2/P3 SLA policy (1h/4h/12h FRT) with breach flags + escalation chips, deterministic auto-triage (keyword severity → priority escalation), LLM draft-reply hook reserved for the Ops registry | `src/lib/ta/care.ts`, care API routes |

## What TA-PRD-SHOP-1.0 adds (BuyWise — consumer shopping module)

| PRD | Feature | Where |
|---|---|---|
| §5 | **Portal architecture**: four surfaces from one route — Arbitrage suite (default landing), BuyWise shop (`/?portal=shop`), Ops + Care consoles; theme-agnostic portal launcher in every chrome | `src/app/page.tsx`, `src/components/portal-launcher.tsx` |
| §6.1–6.2 | **Where-to-buy engine**: free-text product resolution over the existing listing pool (template-synthesis fallback), vendor quotes from the same 67-retailer network + marketplace sellers — totals incl. shipping/tax/coupons, stock, ETA, ratings, returns, warranty, per-vendor 90-day series, computed badges (Lowest total / Fastest / Best returns / Trusted) | `src/lib/ta/shop.ts`, `/api/shop/*` |
| §7 | **Buy-or-wait verdict**: deterministic factor ledger → BUY NOW / BUY / WAIT with calibrated confidence, **dual reasons always shown for both sides**, fair-price meter (90d percentile), savings ticker, seasonal-sale factor; narrative enriched via the LLM registry's new **SHOP capability** with 4.5s timeout + honest built-in fallback — verdicts never depend on the model | `src/lib/ta/shop.ts`, `ops.ts`, `shop-app.tsx` |
| §6.4–6.5 | **Watch & history**: email-scoped price watches with target-vs-current progress, capped analysis history with one-click re-open and quote refresh | `/api/shop/watch/*`, `shop-app.tsx` |
| §9 | **Care ×2 audiences**: CONSUMER tickets with SHOPPING category + consumer triage keywords; shared queue gains customer-type filters; Ticket 360 gains shopper profile, shopping footprint, and the referenced comparison exactly as the customer saw it (top quotes table + verdict + narrative) | `care.ts`, `/api/care/*`, `care-view.tsx`, shop Help |
| §12 | **Distinct consumer UX**: light warm design (violet/amber), verdict hero + confidence ring, expandable vendor rows with sparklines and trust strips, honest demo banner, no-resale-vocabulary guarantee, mobile-first (44px targets, no h-scroll at 390px) | `src/components/shop/shop-app.tsx` |

---

## Feature coverage (PRD → implementation)

| PRD | Feature | Where |
|---|---|---|
| FR-1.x | Scan engine: per-retailer adapters, Tier A/B/C cadences (2–4h / 12–24h / weekly), SKU minting, price drift, freshness aging, retailer health & coverage tracking | `src/lib/ta/scan.ts`, `src/lib/ta/catalog.ts` |
| FR-2.x | Matching funnel: GTIN-exact + fuzzy scoring, confidence bands (**≥0.97 auto-accept, 0.85–0.96 review queue, <0.85 reject**), flag-bad-match feedback loop | `src/lib/ta/catalog.ts`, `src/app/api/match/flag` |
| FR-3.x | Fee engine: category referral % (incl. low-price tiers), FBA size-tier fulfillment table, monthly storage, inbound shipping, prep fees, sourcing-state sales tax, breakeven solver, deal score | `src/lib/ta/profit.ts` |
| FR-4.1 | Filter panel: profit, ROI, margin, BSR, price, category, freshness, risk flags, seller presence | `src/lib/ta/filters.ts`, `src/components/ta/deal-finder.tsx` |
| FR-4.2 | Risk flags: gated, hazmat, oversize, meltable, fragile, IP-claim, Amazon Retail on-listing, low offer count | `src/lib/ta/types.ts`, `src/lib/ta/leadEngine.ts` |
| FR-5.x | Deal store: denormalized `Lead` hot-path table (PRD §9 pattern), incremental rebuild by scan engine | `prisma/schema.prisma` |
| FR-6.x | Keepa-style 90-day price/BSR history + breakeven reference chart in lead drawer | `src/lib/ta/history.ts`, `src/components/ta/lead-drawer.tsx` |
| FR-7.1 | Lead pipeline state machine + VA-friendly bulk status updates | `src/components/ta/pipeline.tsx`, `src/app/api/pipeline` |
| FR-8.1 | CSV export: leads (filtered view) + pipeline | `src/app/api/export` |
| FR-9.1 | Subscription tiers: Starter $59 / Pro $99 / Expert $159, annual toggle (2 months free), usage meters | `src/lib/ta/types.ts`, `src/components/ta/billing.tsx`, `src/app/api/billing` |
| FR-9.2 | Scan-slot fair scheduling by plan (daily scan budget, leads-per-scan caps) | `src/app/api/scan/run` |
| NFR | Query UX: server-side pagination + indexed denormalized queries; dashboard KPIs (fresh leads, precision, freshness SLA, coverage) | `src/app/api/dashboard` |

## Tech stack

- **Next.js 16** (App Router, standalone output) + **React 19** + **TypeScript**
- **Tailwind CSS 4** + **shadcn/ui** (Radix primitives) + **lucide-react**
- **Prisma ORM** + **SQLite** (swap to Postgres for production scale — schema is portable)
- **recharts** for dashboard & price-history charts
- **zustand** for client view state

## Quick start

```bash
# 1. Install dependencies (npm, pnpm or bun all work)
npm install

# 2. Configure the database URL
cp .env.example .env
#   .env.example uses file:../db/custom.db (resolved relative to prisma/schema.prisma).
#   You can also use an absolute path: DATABASE_URL="file:/absolute/path/to/db/custom.db"

# 3. Sync the Prisma schema to SQLite
npm run db:push

# 4. Run the app
npm run dev          # http://localhost:3000
```

**Demo data**: the repository ships with a pristine pre-seeded SQLite database
(`db/custom.db` — 67 retailers, ~180 Amazon listings, ~1,000 SKUs, ~830 leads,
4 saved scans, 30 pipeline items, 14 days of scan history). First launch drops you
into the onboarding wizard; completing it creates 3 default saved scans and lands
you on the Dashboard.

To regenerate the dataset from scratch at any time:

```bash
curl -X POST http://localhost:3000/api/seed
```

or use **Settings → Reset demo data** in the UI.

### Production build

```bash
npm run build
npm start            # serves .next/standalone/server.js
```

## Project structure

```
src/
├── app/
│   ├── api/                 # 14 route handlers (REST-ish JSON API)
│   │   ├── bootstrap/       # one-shot app state (settings, retailers, counts)
│   │   ├── seed/            # POST → full demo reseed
│   │   ├── leads/           # filtered/paginated deal queries + lead detail
│   │   ├── scansets/        # saved scans CRUD + [id] update
│   │   ├── scan/run/        # execute a scan pass (plan-limited, fair slots)
│   │   ├── retailers/       # retailer board + rescan triggers
│   │   ├── pipeline/        # pipeline items + status transitions
│   │   ├── export/          # CSV export (leads / pipeline)
│   │   ├── match/flag/      # crowdsource-style bad-match feedback
│   │   ├── settings/        # sourcing defaults, exclusions, plan switch
│   │   ├── billing/         # plan catalog + usage
│   │   └── dashboard/       # KPI aggregation
│   ├── layout.tsx
│   └── page.tsx             # single-page app shell
├── components/
│   ├── ta/                  # product UI (13 components)
│   │   ├── ta-app.tsx       # shell + view router (zustand)
│   │   ├── onboarding.tsx   # 4-step first-run wizard
│   │   ├── dashboard.tsx    # KPI cards + charts
│   │   ├── deal-finder.tsx  # filter panel + results grid + pagination
│   │   ├── lead-drawer.tsx  # fee breakdown, breakeven, 90-day history
│   │   ├── scans.tsx        # saved scans + schedules + run-now
│   │   ├── pipeline.tsx     # status ribbon + bulk ops
│   │   ├── retailers.tsx    # 67-retailer board (tier, cadence, coverage)
│   │   ├── billing.tsx      # plans, annual toggle, usage meters
│   │   ├── settings-view.tsx# sourcing defaults, exclusions, reset
│   │   └── badges.tsx / product-image.tsx / store.ts
│   └── ui/                  # shadcn/ui primitives
├── hooks/                   # use-mobile, use-toast
└── lib/
    ├── db.ts                # Prisma client singleton
    └── ta/                  # ── the product core ──
        ├── types.ts         # domain types, plans, risk flags
        ├── profit.ts        # fee engine + deal score + breakeven
        ├── catalog.ts       # retailer network + catalog simulation
        ├── history.ts       # Keepa-style 90-day price/BSR walks
        ├── leadEngine.ts    # single source of truth for lead snapshots
        ├── scan.ts          # scan engine (planning, minting, matching)
        ├── filters.ts       # filter → Prisma where + CSV serializer
        ├── seed.ts          # deterministic demo dataset
        └── api.ts           # shared API helpers
prisma/schema.prisma          # 10 models (denormalized deal store)
db/custom.db                  # pristine pre-seeded SQLite database
```

## Core engine notes

### Fee engine (`profit.ts`)
Net profit per PRD §FR-3.1:

```
net = buyBox − retail − retailShipping − referralFee − fbaFulfillment
      − monthlyStorage − inboundShipping − prep − salesTax
```

- Referral fee: per-category %, with the Amazon low-price (≤ $10) flat-fee tier.
- FBA fulfillment: full US size-tier table (small standard → oversize), with
  weight-handling surcharge inference above tier thresholds.
- Sales tax: user-configurable sourcing state rate (settings).
- Also derives: ROI, margin, breakeven buy cost (solver), and a 0–100 deal score
  blending profit, ROI, BSR, freshness and risk.

### Matching funnel (`scan.ts`)
Confidence bands per PRD §FR-2.3: **≥ 0.97 auto-accepted**, **0.85–0.96 → REVIEW
queue** (visible in dashboard, actionable via *Flag bad match*), **< 0.85 rejected**.
GTIN-exact matches always take precedence over fuzzy candidates. Flagging a match
feeds back into the review queue and excludes the pairing from future auto-accepts.

### Scan engine (`scan.ts`)
Each scan pass: plans by tier cadence SLA → mints new SKUs from the catalog
simulation with realistic discount distributions → re-drifts prices on existing
SKUs → recomputes fee math → ages freshness against tier SLA → updates retailer
health/coverage → emits activity events. Plan limits (scans/day, leads/scan) are
enforced at the API layer per FR-9.2.

## Subscription plans

| | Starter $59/mo | Pro $99/mo | Expert $159/mo |
|---|---|---|---|
| Markets | 1 | 3 | All |
| Scans/day | 5 | 25 | Unlimited* |
| Chrome extension | — | ✓ | ✓ |
| Email/Telegram digests | — | ✓ | ✓ |
| Sub-accounts (VA) | — | — | ✓ |
| API access | — | — | ✓ |

Annual billing = 2 months free. *Fair-use scan scheduling applies.

## Demo walkthrough (how a seller uses it)

1. **Saved Scans** — each card shows *+N new since last run*. Click **Show results** to open Deal Finder scoped to that scan
   (toggle *New from last run* / *All matching*, tweak filters, **Save filters to scan**). **Run now** — or wait: active scans
   auto-run on their schedule while the app is open.
2. **Deal Finder / lead drawer** — every product shows chips for the scan that found it (green) and other scans it matches (blue).
   Click **Save** to send it to the pipeline (risky flags trigger a warning; the expected profit is snapshotted).
3. **Buy** — the app doesn't check out for you. Use **Buy at {retailer}** (lead drawer or pipeline card) to find the item on the
   retailer's site, buy it there, then click **Record purchase** in the Pipeline (units, unit cost, order number).
4. **Track** — move items Shipped → Live → Won/Lost by hand; enter **Actual $** on Won/Lost cards to see realized profit.

> On Vercel the demo DB is copied to `/tmp` per instance, so changes reset on a cold start.

## Demo constraints (read me)

This build is a **self-contained product implementation against the fictional
PRD**. In this sandbox:

- The crawler layer is **simulated** — no HTTP requests are made to the 67 listed
  retailers; SKUs/prices are generated by a deterministic catalog engine with
  realistic category skews (Best Buy → Electronics, Chewy → Pet, Ulta → Beauty…).
- Amazon SP-API, Keepa and the Chrome extension are **simulated** by the fee
  engine + history generator.
- Product imagery uses deterministic gradient placeholders.

Everything above the data-acquisition boundary (fee math, matching funnel, deal
store, filters, pipeline, billing, exports, UI) is fully implemented and
deterministic — wiring real adapters/SP-API is an infrastructure task, not a
product-logic one.
