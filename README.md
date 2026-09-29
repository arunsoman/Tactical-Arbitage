# Tactical Arbitrage (TA) — OA Sourcing Platform

Web-based product-sourcing platform for **online arbitrage (OA) sellers**, built from PRD Draft v2.3 (For Engineering Review). It implements the core value loop:

> **Scan → Match → Calculate → Filter → Act**

— continuously "scans" a network of 67 real US retail sites (Walmart, Best Buy, Target, Costco, Home Depot, Chewy, Walgreens, CVS, Staples, …), matches retailer products to a fictional-but-realistic Amazon catalog, computes **true net profit** after all Amazon fees, filters leads by user-defined criteria, and drives a full action pipeline (New → Interested → Purchased → Shipped → Live → Won/Lost).

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
