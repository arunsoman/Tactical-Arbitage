'use client';

// Portal root (TA-PRD-SHOP-1.0 §5.1): the default landing surface is the
// Arbitrage suite; /?portal=shop renders the BuyWise consumer portal from the
// same route so deep links stay shareable in the single-route deployment.
// useSearchParams + Suspense keeps SSR and the first client render identical.

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Radar } from 'lucide-react';

const TAApp = dynamic(() => import('@/components/ta/ta-app').then((m) => m.TAApp));
const ShopApp = dynamic(() => import('@/components/shop/shop-app').then((m) => m.ShopApp));

function PortalSwitch() {
  const portal = useSearchParams().get('portal');
  if (portal === 'shop') return <ShopApp />;
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
