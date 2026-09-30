'use client';

// Portal launcher — shared, theme-agnostic switcher for the four surfaces:
// Arbitrage suite (default) / BuyWise shop / Ops Console / Care Console.
// Rendered as a light floating panel so it reads correctly on both the dark
// TA shell and the light BuyWise chrome (TA-PRD-SHOP-1.0 §5.1).

import { useEffect, useRef, useState } from 'react';
import { LayoutGrid, Radar, ShoppingBag, Wrench, Headset, ChevronDown } from 'lucide-react';

export type PortalId = 'ta' | 'shop' | 'ops' | 'care';

const PORTALS: { id: PortalId; label: string; desc: string; icon: typeof Radar; href?: string }[] = [
  { id: 'ta', label: 'Arbitrage Suite', desc: 'AI-first sourcing for resellers', icon: Radar },
  { id: 'shop', label: 'BuyWise Shop', desc: 'Where to buy — AI buy-or-wait', icon: ShoppingBag, href: '/?portal=shop' },
  { id: 'ops', label: 'Ops Console', desc: 'LLMs, connectors, go-live', icon: Wrench, href: '/?view=ops' },
  { id: 'care', label: 'Care Console', desc: 'Tickets & customer 360', icon: Headset, href: '/?view=care' },
];

export function PortalLauncher({ current }: { current: PortalId }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const go = (p: (typeof PORTALS)[number]) => {
    setOpen(false);
    if (p.id === current) return;
    if (p.href) {
      // full navigation so each portal resets its own URL/params cleanly
      window.location.assign(p.href);
    }
  };

  const active = PORTALS.find((p) => p.id === current);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch portal"
        className="flex h-9 items-center gap-1.5 rounded-lg border border-stone-300/60 bg-white/70 px-2.5 text-xs font-semibold text-stone-700 transition-colors hover:bg-white dark:border-stone-600 dark:bg-stone-800/70 dark:text-stone-200 dark:hover:bg-stone-800"
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{active?.label ?? 'Portals'}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-50 w-64 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl dark:border-stone-700 dark:bg-stone-900">
          <p className="border-b border-stone-100 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-stone-400 dark:border-stone-800 dark:text-stone-500">
            Choose a portal
          </p>
          {PORTALS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitem"
              onClick={() => go(p)}
              className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-stone-50 dark:hover:bg-stone-800 ${p.id === current ? 'bg-violet-50/70 dark:bg-violet-950/40' : ''}`}
            >
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${p.id === 'shop' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300' : p.id === 'ta' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'}`}>
                <p.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-stone-800 dark:text-stone-100">
                  {p.label}
                  {p.id === current && <span className="ml-1.5 rounded bg-violet-600 px-1 py-0.5 text-[9px] font-bold text-white">HERE</span>}
                </span>
                <span className="block text-[10px] text-stone-500 dark:text-stone-400">{p.desc}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
