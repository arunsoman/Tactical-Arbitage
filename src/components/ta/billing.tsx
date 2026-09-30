'use client';

// Billing (FR-9.1/9.2): plan tiers, monthly/annual toggle, scan-slot fairness,
// feature gates per plan.

import { useEffect, useState } from 'react';
import { api } from '@/lib/ta/api';
import { useTAStore } from './store';
import { useToast } from '@/hooks/use-toast';
import { PLANS, type Plan } from '@/lib/ta/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Check, X, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const FEATURES: { key: keyof (typeof PLANS)['PRO']; label: string }[] = [
  { key: 'marketplaces', label: 'Amazon marketplaces' },
  { key: 'savedScans', label: 'Saved scans' },
  { key: 'concurrentScanSlots', label: 'Concurrent scan slots' },
  { key: 'extension', label: 'Chrome extension' },
  { key: 'digests', label: 'Daily digest emails' },
  { key: 'api', label: 'REST API + webhooks' },
];

function featureValue(plan: Plan, key: string): string {
  const p = PLANS[plan];
  switch (key) {
    case 'marketplaces':
      return `${p.marketplaces}`;
    case 'savedScans':
      return p.savedScans == null ? 'Unlimited' : `${p.savedScans}`;
    case 'concurrentScanSlots':
      return `${p.concurrentScanSlots}`;
    default: {
      const v = p[key as 'extension' | 'digests' | 'api'];
      return v ? '✓' : '—';
    }
  }
}

export function BillingView() {
  const { bootstrap, setView } = useTAStore();
  const { toast } = useToast();
  const [annual, setAnnual] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const currentPlan = bootstrap?.settings.plan ?? 'PRO';
  const scansets = bootstrap?.counts.scansets ?? 0;
  const limit = PLANS[currentPlan].savedScans;
  const usagePct = limit == null ? 12 : Math.min(100, (scansets / limit) * 100);
  const trialEndsAt = bootstrap?.settings.trialEndsAt;

  const changePlan = async (plan: Plan) => {
    setBusy(plan);
    try {
      await api.changePlan(plan, annual ? 'annual' : 'monthly');
      toast({ title: `Plan changed to ${PLANS[plan].name}`, description: annual ? 'Annual billing — 2 months free applied.' : 'Monthly billing active.' });
      setView('billing');
      window.location.reload();
    } catch (e) {
      toast({ title: 'Plan change failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    // noop placeholder to keep hooks structure stable
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Billing & plans</h2>
          <p className="text-xs text-muted-foreground">
            {trialEndsAt ? `Trial ends ${new Date(trialEndsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} · card on file` : '7-day trial with card required (FR-9.1)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-foreground/80">Monthly</Label>
          <Switch checked={annual} onCheckedChange={setAnnual} aria-label="Toggle annual billing" />
          <Label className="text-xs text-foreground/80">
            Annual <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">2 months free</Badge>
          </Label>
        </div>
      </div>

      {/* usage */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-1.5">
          <p className="text-sm font-semibold text-foreground/80">
            Current usage — {PLANS[currentPlan].name} plan
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Saved scans</span>
              <span className="font-mono font-semibold text-foreground/80">
                {scansets}/{limit ?? '∞'}
              </span>
            </div>
            <Progress value={usagePct} className="h-1.5" />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Marketplaces</span>
              <span className="font-mono font-semibold text-foreground/80">1/{PLANS[currentPlan].marketplaces}</span>
            </div>
            <Progress value={(1 / PLANS[currentPlan].marketplaces) * 100} className="h-1.5" />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Scan slots (queue fairness, FR-9.2)</span>
              <span className="font-mono font-semibold text-foreground/80">{PLANS[currentPlan].concurrentScanSlots}</span>
            </div>
            <Progress value={0} className="h-1.5" />
          </div>
        </CardContent>
      </Card>

      {/* plans */}
      <div className="grid gap-4 lg:grid-cols-3">
        {(Object.keys(PLANS) as Plan[]).map((p) => {
          const spec = PLANS[p];
          const isCurrent = p === currentPlan;
          return (
            <Card key={p} className={cn('relative border-border shadow-sm', isCurrent && 'border-emerald-500 ring-1 ring-emerald-500', p === 'PRO' && !isCurrent && 'ring-1 ring-border')}>
              {p === 'PRO' && (
                <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-400 text-amber-950 hover:bg-amber-400">
                  <Sparkles className="mr-1 h-3 w-3" /> Most popular
                </Badge>
              )}
              <CardHeader className="pb-2">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-base font-bold text-foreground">{spec.name}</h3>
                  <div className="text-right">
                    <p className="font-mono text-2xl font-bold tabular-nums text-foreground">${annual ? spec.annualPrice : spec.price}</p>
                    <p className="text-[10px] text-muted-foreground">per month{annual ? ', billed annually' : ''}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{spec.blurb}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5 text-xs">
                  {FEATURES.map((f) => {
                    const val = featureValue(p, f.key);
                    const on = val !== '—';
                    return (
                      <div key={f.key} className="flex items-center justify-between">
                        <span className={cn('flex items-center gap-1.5', on ? 'text-foreground/80' : 'text-muted-foreground')}>
                          {on ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5 text-muted-foreground" />}
                          {f.label}
                        </span>
                        {on && !['extension', 'digests', 'api'].includes(f.key) && <span className="font-mono text-[11px] font-semibold text-foreground/80">{val}</span>}
                      </div>
                    );
                  })}
                </div>
                <Button
                  className={cn('w-full', isCurrent ? 'bg-secondary text-muted-foreground hover:bg-accent' : 'bg-emerald-600 hover:bg-emerald-500')}
                  disabled={isCurrent || busy === p}
                  onClick={() => changePlan(p)}
                >
                  {busy === p ? <Loader2 className="h-4 w-4 animate-spin" /> : isCurrent ? 'Current plan' : `Switch to ${spec.name}`}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Plan changes apply instantly in this demo. Starter includes web-only sourcing; the Chrome extension (FR-6.1/6.2) activates on Pro and above.
      </p>
    </div>
  );
}
