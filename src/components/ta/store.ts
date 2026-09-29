'use client';

// Global app store: active view, bootstrap data, deal filters, lead selection.

import { create } from 'zustand';
import { DEFAULT_FILTERS, type LeadFilters } from '@/lib/ta/types';
import type { BootstrapDTO, SettingsDTO } from '@/lib/ta/api';

export type View = 'dashboard' | 'deals' | 'scans' | 'pipeline' | 'retailers' | 'billing' | 'settings';

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
}

export const useTAStore = create<TAState>((set) => ({
  view: 'dashboard',
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
}));
