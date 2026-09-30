'use client';

// Onboarding wizard (PRD §6): marketplace → budget → categories → profitability
// floor → generates 3 default scan templates + kicks off the first scans.

import { useState } from 'react';
import { api } from '@/lib/ta/api';
import { useTAStore } from './store';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { DEFAULT_FILTERS, type RiskFlag } from '@/lib/ta/types';
import { Radar, CheckCircle2, Loader2 } from 'lucide-react';

const MARKETPLACES = [
  { id: 'US', label: 'Amazon US', note: 'amazon.com' },
  { id: 'UK', label: 'Amazon UK', note: 'amazon.co.uk' },
  { id: 'CA', label: 'Amazon CA', note: 'amazon.ca' },
  { id: 'DE', label: 'Amazon DE', note: 'amazon.de' },
];

const BUDGETS = [
  { id: 500, label: 'Under $500/mo', note: 'Side-hustle pace, sane defaults' },
  { id: 2000, label: '$500 – $5,000/mo', note: 'Consistent restock cadence' },
  { id: 10000, label: '$5,000 – $25,000/mo', note: 'VA-assisted, deeper scan sets' },
  { id: 50000, label: '$25k+/mo', note: 'Multi-market operations' },
];

const RISK_LEVELS = [
  { id: 'conservative', label: 'Conservative', note: 'Proven brands only, no flagged risk — safe mode picks' },
  { id: 'balanced', label: 'Balanced', note: 'Solid ROI with some flagged risk surfaced — recommended' },
  { id: 'aggressive', label: 'Aggressive', note: 'Wider funnel, more candidates, higher variance' },
];

export function OnboardingWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [marketplace, setMarketplace] = useState('US');
  const [budget, setBudget] = useState(2000);
  const [riskTolerance, setRiskTolerance] = useState('balanced');
  const [categories, setCategories] = useState<string[]>(['Health & Household', 'Grocery & Gourmet']);
  const [minRoi, setMinRoi] = useState(30);
  const [minProfit, setMinProfit] = useState(5);
  const [busy, setBusy] = useState(false);
  const { bootstrap } = useTAStore();
  const { toast } = useToast();

  const allCats = bootstrap?.categories ?? [];

  const finish = async (skip: boolean) => {
    setBusy(true);
    try {
      if (!skip) {
        await api.updateSettings({ onboarded: true, marketplace, monthlyBudget: budget, minRoi, minProfit, riskTolerance, preferredCategories: categories });
        // replace seeded defaults with the user's calibrated scan templates
        const existing = await api.scanSets();
        const defaultNames = ['Clearance Health & Beauty', 'Toys deal feed', 'Grocery monthly deals'];
        await Promise.all(
          existing.scans
            .filter((s) => s.isDefault || defaultNames.includes(s.name))
            .map((s) => api.deleteScanSet(s.id))
        );
        const flagBase = ['GATED', 'HAZMAT', 'IP_CLAIM'] as RiskFlag[];
        await api.createScanSet({
          name: 'Clearance Health & Beauty',
          schedule: 'every_2h',
          filters: { ...DEFAULT_FILTERS, categories: ['Health & Household', 'Beauty'], minRoi, minProfit, excludeFlags: flagBase },
        });
        await api.createScanSet({
          name: 'Toys deal feed',
          schedule: 'daily',
          filters: { ...DEFAULT_FILTERS, categories: ['Toys & Games'], minRoi: Math.max(20, minRoi - 5), minProfit, excludeFlags: ['IP_CLAIM' as RiskFlag] },
        });
        await api.createScanSet({
          name: 'Grocery monthly deals',
          schedule: 'weekly',
          filters: { ...DEFAULT_FILTERS, categories: ['Grocery & Gourmet'], minRoi: Math.max(15, minRoi - 10), minProfit },
        });
        toast({ title: 'Scans configured — first cycle running', description: 'Your 3 default scan templates were created.' });
      } else {
        await api.updateSettings({ onboarded: true });
      }
      onDone();
    } catch (e) {
      toast({ title: 'Setup failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const steps = ['Marketplace', 'Budget', 'Risk profile', 'Categories', 'Profit floor'];

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] overflow-y-auto rounded-xl sm:max-w-lg" aria-describedby="onboarding-desc">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2 text-emerald-600">
            <Radar className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Tactical Arbitrage</span>
          </div>
          <DialogTitle className="text-xl">{step === 0 ? 'Welcome — let’s calibrate your sourcing' : steps[step]}</DialogTitle>
          <DialogDescription id="onboarding-desc">
            {step === 0 && 'Four quick answers and your first profitable leads will be waiting — typically under 10 minutes (G4).'}
            {step === 1 && 'How much inventory do you buy per month? This tunes scan depth and default filters.'}
            {step === 2 && 'Your risk profile shapes safe-mode thresholds and how aggressively AI Picks rank flagged deals.'}
            {step === 3 && 'Pick the categories your scans should watch. You can change these anytime.'}
            {step === 4 && 'The minimum deal quality you want surfaced. We compute breakeven from this (FR-3.5).'}
          </DialogDescription>
        </DialogHeader>

        <Progress value={((step + 1) / 5) * 100} className="h-1.5" />

        <div className="min-h-[240px] py-2">
          {step === 0 && (
            <RadioGroup value={marketplace} onValueChange={setMarketplace} className="grid gap-2">
              {MARKETPLACES.map((m) => (
                <Label
                  key={m.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent',
                    marketplace === m.id && 'border-emerald-500 bg-emerald-50/60'
                  )}
                >
                  <RadioGroupItem value={m.id} />
                  <div>
                    <p className="text-sm font-semibold">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.note}</p>
                  </div>
                </Label>
              ))}
            </RadioGroup>
          )}

          {step === 1 && (
            <RadioGroup value={String(budget)} onValueChange={(v) => setBudget(Number(v))} className="grid gap-2">
              {BUDGETS.map((b) => (
                <Label
                  key={b.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent',
                    budget === b.id && 'border-emerald-500 bg-emerald-50/60'
                  )}
                >
                  <RadioGroupItem value={String(b.id)} />
                  <div>
                    <p className="text-sm font-semibold">{b.label}</p>
                    <p className="text-xs text-muted-foreground">{b.note}</p>
                  </div>
                </Label>
              ))}
            </RadioGroup>
          )}

          {step === 2 && (
            <RadioGroup value={riskTolerance} onValueChange={setRiskTolerance} className="grid gap-2">
              {RISK_LEVELS.map((r) => (
                <Label
                  key={r.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent',
                    riskTolerance === r.id && 'border-emerald-500 bg-emerald-50/60'
                  )}
                >
                  <RadioGroupItem value={r.id} />
                  <div>
                    <p className="text-sm font-semibold">{r.label}</p>
                    <p className="text-xs text-muted-foreground">{r.note}</p>
                  </div>
                </Label>
              ))}
            </RadioGroup>
          )}

          {step === 3 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {allCats.map((c) => (
                <Label
                  key={c}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 text-sm transition-colors hover:bg-accent',
                    categories.includes(c) && 'border-emerald-500 bg-emerald-50/60'
                  )}
                >
                  <Checkbox
                    checked={categories.includes(c)}
                    onCheckedChange={(v) => setCategories((prev) => (v ? [...prev, c] : prev.filter((x) => x !== c)))}
                  />
                  {c}
                </Label>
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6 pt-2">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-sm font-semibold">Minimum ROI</Label>
                  <span className="font-mono text-sm font-bold text-emerald-700">{minRoi}%</span>
                </div>
                <Slider value={[minRoi]} onValueChange={(v) => setMinRoi(v[0])} min={10} max={80} step={5} />
                <p className="mt-1 text-xs text-muted-foreground">Profit ÷ landed cost. 30% is the common OA floor.</p>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-sm font-semibold">Minimum profit per unit</Label>
                  <span className="font-mono text-sm font-bold text-emerald-700">${minProfit}</span>
                </div>
                <Slider value={[minProfit]} onValueChange={(v) => setMinProfit(v[0])} min={1} max={25} step={1} />
                <p className="mt-1 text-xs text-muted-foreground">Filters out high-ROI-but-tiny-dollar flips.</p>
              </div>
              <div className="rounded-lg bg-secondary p-3 text-xs text-foreground/80">
                Your default filter becomes: <b>ROI ≥ {minRoi}%</b>, <b>profit ≥ ${minProfit}</b>. All 3 scan templates start from this floor.
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => finish(true)} disabled={busy} className="text-muted-foreground">
            Skip setup
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)} disabled={busy}>
                Back
              </Button>
            )}
            {step < 4 ? (
              <Button
                size="sm"
                onClick={() => setStep((s) => s + 1)}
                disabled={step === 3 && categories.length === 0}
                className="bg-emerald-600 hover:bg-emerald-500"
              >
                Continue
              </Button>
            ) : (
              <Button size="sm" onClick={() => finish(false)} disabled={busy} className="gap-1.5 bg-emerald-600 hover:bg-emerald-500">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Create scans & run
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
