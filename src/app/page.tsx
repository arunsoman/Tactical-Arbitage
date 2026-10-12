'use client';

// Portal root (TA-PRD-SHOP-1.0 §5.1) — narrowed to the investor-demo scope:
// the funded AI feature build lives in the Arbitrage suite. The BuyWise / Ops /
// Care portals and every deep link to them are grayed out; any ?portal / ?view
// param lands in the Arbitrage suite with the URL normalized.

import { Suspense, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Radar } from 'lucide-react';

const TAApp = dynamic(() => import('@/components/ta/ta-app').then((m) => m.TAApp));

function PortalSwitch() {
  const portal = useSearchParams().get('portal') ?? 'ta';
  const live = portal === 'ta';
  // Dead portal links (shop / ops / care) normalize to the root — the surface
  // itself is grayed out of this build.
  useEffect(() => {
    if (!live) window.history.replaceState({}, '', '/');
  }, [live]);
  return <TAApp />;
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Radar className="h-8 w-8 animate-pulse text-emerald-500" />
            <p className="text-sm">Loading Tactical Arbitrage…</p>
          </div>
        </div>
      }
    >
      <PortalSwitch />
    </Suspense>
  );
}