'use client';

// Global app store: active view, bootstrap data, deal filters, lead selection.

import { create } from 'zustand';
import { DEFAULT_FILTERS, type LeadFilters } from '@/lib/ta/types';
import type { BootstrapDTO, SettingsDTO } from '@/lib/ta/api';

export type View = 'dashboard' | 'deals' | 'scans' | 'pipeline' | 'retailers' | 'billing' | 'settings';

interface TAState {
  view: View;
  setView: (v: View) => void;

  bootstrap: BootstrapDTO | null;
  setBootstrap: (b: BootstrapDTO) => void;
  patchSettings: (s: Partial<SettingsDTO>) => void;

  filters: LeadFilters;
  setFilters: (f: LeadFilters) => void;
  resetFilters: () => void;

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

  selectedLeadId: null,
  openLead: (id) => set({ selectedLeadId: id }),

  dealRefreshKey: 0,
  bumpDealRefresh: () => set((st) => ({ dealRefreshKey: st.dealRefreshKey + 1 })),

  scanning: false,
  setScanning: (b) => set({ scanning: b }),
}));
