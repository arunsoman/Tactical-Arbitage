'use client';

// Locked-surface screen — what investors see when they open any surface that is
// NOT part of the funded AI feature build (₹15L scope). One screen per surface
// so every grayed-out nav item tells the same coherent roadmap story: "this
// exists in the product vision, the funded build covers the AI layer."

import { Lock } from 'lucide-react';
import type { View } from './store';
import { useTAStore } from './store';
import { Button } from '@/components/ui/button';
import { Home, Radar, MessageSquareMore, MessageCircleMore } from 'lucide-react';

const LOCKED_META: Partial<Record<View, { title: string; blurb: string; phase: string }>> = {
  dashboard: {
    title: 'Dashboard & KPIs',
    blurb: 'North-star metrics, leads/day, precision, freshness SLA and retail-network coverage charts.',
    phase: 'Analytics workstream',
  },
  deals: {
    title: 'Deal Finder',
    blurb: 'Full filter-pane browsing of the entire deal store with pagination and saved-scan scoping. The demo path — AI Picks and NL search — covers the intelligent version of this flow.',
    phase: 'Workflow tools',
  },
  scans: {
    title: 'Saved Scans & Schedules',
    blurb: 'Scan set management, tiered cadences (2–4h / 12–24h / weekly) and fair-slot scheduling across the retailer network.',
    phase: 'Data-acquisition workstream',
  },
  pipeline: {
    title: 'Lead Pipeline',
    blurb: 'New → Purchased → Shipped → Won/Lost state machine with snapshot economics, bulk ops and VA ownership. Outcomes you log from AI Picks power the same learning loop.',
    phase: 'Workflow tools',
  },
  alerts: {
    title: 'Notifications & Alerts',
    blurb: 'Actionable push digests with deep links that land straight on the reasoning — the demo build surfaces the same intelligence inside AI Picks and the assistant.',
    phase: 'Engagement phase',
  },
  retailers: {
    title: 'Retailer Network Board',
    blurb: 'The 67-retailer network with tier, cadence, health and coverage metrics; rescan triggers and connector SLA views.',
    phase: 'Data-acquisition workstream',
  },
  team: {
    title: 'Team, Approvals & Audit',
    blurb: 'Owner / Manager / VA roles, buy & suppress approval workflows, immutable audit trail.',
    phase: 'Collaboration phase',
  },
  ai: {
    title: 'AI Status & Evaluation',
    blurb: 'Operator view: latency budgets (rank < 2s, reasons < 5s), online evaluation (NDCG@10, precision, drift alerts), learning coverage and cost per recommendation.',
    phase: 'Ops workstream',
  },
  billing: {
    title: 'Billing & Plans',
    blurb: 'Subscription tiers, annual toggle and usage meters. Shown grayed out so the demo stays decision-focused rather than commerce-focused.',
    phase: 'Commercial phase',
  },
  settings: {
    title: 'Settings & Defaults',
    blurb: 'Sourcing state, fee assumptions, exclusions, risk tolerance and theme. The seeded demo profile already carries sensible defaults.',
    phase: 'Commercial phase',
  },
  support: {
    title: 'Help & Support',
    blurb: 'Customer-facing ticket portal with categories, SLA expectations and CSAT.',
    phase: 'Care workstream',
  },
  ops: {
    title: 'Ops Console',
    blurb: 'LLM registry with tiered capability routing, supplier connectors with five-test gating and the go-live lifecycle engine.',
    phase: 'Ops workstream',
  },
  care: {
    title: 'Care Console',
    blurb: 'Agent queue with SLA tracking, Ticket 360 (customer profile + full deal economics) and workflow automation.',
    phase: 'Care workstream',
  },
};

const COVERED = [
  { label: 'Evidence-linked AI ranking + reasoning', view: 'picks' as View },
  { label: 'Natural-language search (typed + voice)', view: 'search' as View },
  { label: 'Buy-or-wait verdicts + fair-price meter', view: 'picks' as View },
  { label: 'Calibrated confidence with explanations', view: 'picks' as View },
  { label: 'Feedback loop (bought / not interested / bad match)', view: 'picks' as View },
  { label: 'Grounded demo assistant', view: 'assistant' as View },
];

export function LockedView({ view }: { view: View }) {
  const setView = useTAStore((s) => s.setView);
  const meta = LOCKED_META[view];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-3 pb-24 pt-6 md:px-4">
      {/* locked hero */}
      <section className="rounded-2xl border border-border bg-card p-5 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted" aria-hidden>
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="mt-3 text-lg font-bold">{meta?.title ?? 'Planned surface'}</h1>
        <p className="mx-auto mt-1 max-w-lg text-[13px] leading-relaxed text-muted-foreground">{meta?.blurb}</p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
            <Lock className="h-3 w-3" /> Not covered in the ₹15L build
          </span>
          <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{meta?.phase ?? 'Roadmap'}</span>
        </div>
        <p className="mx-auto mt-3 max-w-md text-[11px] leading-relaxed text-muted-foreground">
          The funded scope is the AI intelligence layer: it ships complete, deterministic and zero-inference-cost. This surface is the post-budget roadmap — designed, specced and intentionally out of this build.
        </p>
      </section>

      {/* what IS covered */}
      <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">What the funded build covers — all live now</p>
        <ul className="mt-2 space-y-1.5">
          {COVERED.map((c) => (
            <li key={c.label} className="flex items-center gap-2 text-[13px]">
              <span className="text-emerald-600 dark:text-emerald-400" aria-hidden>✓</span>
              <span className="font-medium">{c.label}</span>
              <button
                type="button"
                onClick={() => setView(c.view)}
                className="ml-auto rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                See it live
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* quick CTAs back to the AI surfaces */}
      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" className="h-12 border-emerald-500/40 text-emerald-600 dark:text-emerald-400" onClick={() => setView('picks')}>
          <Home className="mr-1.5 h-4 w-4" /> Picks
        </Button>
        <Button variant="outline" className="h-12 border-emerald-500/40 text-emerald-600 dark:text-emerald-400" onClick={() => setView('search')}>
          <Radar className="mr-1.5 h-4 w-4" /> Ask
        </Button>
        <Button variant="outline" className="h-12 border-emerald-500/40 text-emerald-600 dark:text-emerald-400" onClick={() => setView('assistant')}>
          <MessageCircleMore className="mr-1.5 h-4 w-4" /> Assistant
        </Button>
      </div>

      <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-[11px] text-muted-foreground">
        <MessageSquareMore className="h-3 w-3" aria-hidden />
        Tip for the demo: ask the assistant why a pick ranks — it answers with the full evidence chain.
      </p>
    </div>
  );
}