'use client';

// Global app store: active view, bootstrap data, deal filters, lead selection,
// and v2.2 AI-first view/deep-link state.

import { create } from 'zustand';
import { DEFAULT_FILTERS, type LeadFilters } from '@/lib/ta/types';
import type { BootstrapDTO, SettingsDTO } from '@/lib/ta/api';

export type View =
  | 'picks' // AI Picks — default home (§10)
  | 'search' // natural-language deal search (US-5)
  | 'assistant' // conversational demo assistant (tool-using, retrieval-grounded)
  | 'dashboard'
  | 'deals'
  | 'scans'
  | 'pipeline'
  | 'alerts'
  | 'retailers'
  | 'team'
  | 'ai'
  | 'billing'
  | 'settings'
  | 'ops' // Ops & Platform Administration (PRD TA-PRD-OPS-1.0)
  | 'care' // Care Console — agent queue + Ticket 360 (PRD TA-PRD-CARE-1.0)
  | 'support'; // Help & Support — customer face of the care portal

/**
 * Investor-demo scope: ONLY this AI feature set is live (built to a fixed budget):
 *   1. Evidence-linked AI ranking + reasoning ("why this rank?")
 *   2. Natural-language deal search (typed + voice, refinement memory)
 *   3. Buy-or-Wait opportunity verdict (dual-sided reasons + fair-price meter)
 *   4. Calibrated confidence scores with explanations
 *   5. Lightweight outcome / feedback loop (bought / not interested / bad match)
 *   6. Grounded demo assistant (retrieval-based, no open-ended generation)
 * Everything else renders grayed out across the shell.
 */
export const ENABLED_VIEWS: readonly View[] = ['picks', 'search', 'assistant'];

export function isViewEnabled(v: View): boolean {
  return (ENABLED_VIEWS as readonly string[]).includes(v);
}

/** A saved scan whose results are being browsed in Deal Finder. */
export interface ActiveScan {
  id: string;
  name: string;
  /** leads first seen at/after this ISO time are "new from the last run" */
  since: string | null;
  newCount: number;
}

interface TAState {
  view: View;
  setView: (v: View) => void;

  bootstrap: BootstrapDTO | null;
  setBootstrap: (b: BootstrapDTO) => void;
  patchSettings: (s: Partial<SettingsDTO>) => void;

  filters: LeadFilters;
  setFilters: (f: LeadFilters) => void;
  resetFilters: () => void;

  activeScan: ActiveScan | null;
  newOnly: boolean;
  /** open Deal Finder scoped to a scan (filters + optional new-only) */
  browseScan: (scan: ActiveScan, filters: LeadFilters, newOnly: boolean) => void;
  setNewOnly: (b: boolean) => void;
  clearScan: () => void;

  selectedLeadId: string | null;
  openLead: (id: string | null) => void;

  dealRefreshKey: number;
  bumpDealRefresh: () => void;

  scanning: boolean;
  setScanning: (b: boolean) => void;

  // AI picks state
  picksRefreshKey: number;
  bumpPicksRefresh: () => void;

  // v2.2 mobile detail sheet payload (deal deep links land here)
  deepLinkLeadId: string | null;
  setDeepLinkLeadId: (id: string | null) => void;
}

export const useTAStore = create<TAState>((set) => ({
  view: 'picks',
  // any view can become active — non-scope views render the locked (roadmap) screen
  setView: (v) => set({ view: v }),

  bootstrap: null,
  setBootstrap: (b) => set({ bootstrap: b }),
  patchSettings: (s) =>
    set((st) => (st.bootstrap ? { bootstrap: { ...st.bootstrap, settings: { ...st.bootstrap.settings, ...s } } } : {})),

  filters: { ...DEFAULT_FILTERS },
  setFilters: (f) => set({ filters: f }),
  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),

  activeScan: null,
  newOnly: false,
  browseScan: (scan, filters, newOnly) => set({ activeScan: scan, filters: { ...DEFAULT_FILTERS, ...filters }, newOnly, view: 'deals' }),
  setNewOnly: (b) => set({ newOnly: b }),
  clearScan: () => set({ activeScan: null, newOnly: false }),

  selectedLeadId: null,
  openLead: (id) => set({ selectedLeadId: id }),

  dealRefreshKey: 0,
  bumpDealRefresh: () => set((st) => ({ dealRefreshKey: st.dealRefreshKey + 1 })),

  scanning: false,
  setScanning: (b) => set({ scanning: b }),

  picksRefreshKey: 0,
  bumpPicksRefresh: () => set((st) => ({ picksRefreshKey: st.picksRefreshKey + 1 })),

  deepLinkLeadId: null,
  setDeepLinkLeadId: (id) => set({ deepLinkLeadId: id }),
}));
