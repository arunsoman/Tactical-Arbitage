'use client';

// Settings — sourcing defaults (FR-3.3 tax handling), cost inputs, exclusions,
// onboarding replay, demo-data reset.

import { useEffect, useState } from 'react';
import { api } from '@/lib/ta/api';
import { useTAStore } from './store';
import { useToast } from '@/hooks/use-toast';
import { PLANS } from '@/lib/ta/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Save, RotateCcw, Trash2, Plus } from 'lucide-react';
import { parseJsonArray } from '@/lib/ta/types';

const STATES = ['MT', 'OR', 'NH', 'DE', 'AK', 'CA', 'NY', 'TX', 'FL', 'WA'];
const STATE_TAX: Record<string, number> = { MT: 0, OR: 0, NH: 0, DE: 0, AK: 0, CA: 0.0725, NY: 0.04, TX: 0.0625, FL: 0.06, WA: 0.065 };

export function SettingsView() {
  const { bootstrap, patchSettings } = useTAStore();
  const { toast } = useToast();
  const [form, setForm] = useState<Record<string, string>>({});
  const [brandInput, setBrandInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const s = bootstrap?.settings;

  useEffect(() => {
    if (s) {
      setForm({
        marketplace: s.marketplace,
        sourcingState: s.sourcingState,
        minRoi: String(s.minRoi),
        minProfit: String(s.minProfit),
        maxBsr: String(s.maxBsr),
        prepCost: String(s.prepCost),
        inboundCost: String(s.inboundCost),
        monthlyBudget: String(s.monthlyBudget),
      });
    }
  }, [s]);

  if (!s) return null;

  const save = async () => {
    setBusy(true);
    try {
      const taxRate = STATE_TAX[form.sourcingState] ?? 0;
      const body = {
        marketplace: form.marketplace,
        sourcingState: form.sourcingState,
        taxRate,
        minRoi: Number(form.minRoi),
        minProfit: Number(form.minProfit),
        maxBsr: Number(form.maxBsr),
        prepCost: Number(form.prepCost),
        inboundCost: Number(form.inboundCost),
        monthlyBudget: Number(form.monthlyBudget),
      };
      await api.updateSettings(body);
      patchSettings(body);
      toast({
        title: 'Settings saved',
        description: `Sourcing state ${form.sourcingState} → tax rate ${(taxRate * 100).toFixed(2)}%. New scans use these costs.`,
      });
    } catch (e) {
      toast({ title: 'Save failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const excludedBrands = parseJsonArray(s.excludedBrands);
  const excludedAsins = parseJsonArray(s.excludedAsins);

  const addExclusion = async (kind: 'brands' | 'asins') => {
    const val = (kind === 'brands' ? brandInput : brandInput).trim();
    if (!val) return;
    const current = kind === 'brands' ? excludedBrands : excludedAsins;
    const next = [...current, val.toUpperCase()];
    await api.updateSettings({ [kind === 'brands' ? 'excludedBrands' : 'excludedAsins']: next });
    patchSettings({ [kind === 'brands' ? 'excludedBrands' : 'excludedAsins']: JSON.stringify(next) } as never);
    setBrandInput('');
    toast({ title: `${val} excluded`, description: 'Leads for this entry stop appearing in every view.' });
  };

  const removeExclusion = async (kind: 'brands' | 'asins', v: string) => {
    const current = kind === 'brands' ? excludedBrands : excludedAsins;
    const next = current.filter((x) => x !== v);
    await api.updateSettings({ [kind === 'brands' ? 'excludedBrands' : 'excludedAsins']: next });
    patchSettings({ [kind === 'brands' ? 'excludedBrands' : 'excludedAsins']: JSON.stringify(next) } as never);
  };

  const resetDemo = async () => {
    setSeeding(true);
    try {
      await api.seed();
      toast({ title: 'Demo data rebuilt', description: '344 leads re-priced by the fee engine, pipeline + scans restored.' });
      window.location.reload();
    } catch (e) {
      toast({ title: 'Reset failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
      setSeeding(false);
    }
  };

  const replayOnboarding = async () => {
    await api.updateSettings({ onboarded: false });
    window.location.reload();
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-800">Sourcing defaults</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-600">Marketplace</Label>
                <Select value={form.marketplace ?? 'US'} onValueChange={(v) => setForm((f) => ({ ...f, marketplace: v }))}>
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="US">Amazon US</SelectItem>
                    <SelectItem value="UK">Amazon UK</SelectItem>
                    <SelectItem value="CA">Amazon CA</SelectItem>
                    <SelectItem value="DE">Amazon DE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Sourcing state (FR-3.3)</Label>
                <Select value={form.sourcingState ?? 'MT'} onValueChange={(v) => setForm((f) => ({ ...f, sourcingState: v }))}>
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATES.map((st) => (
                      <SelectItem key={st} value={st}>
                        {st} — {(STATE_TAX[st] * 100).toFixed(2)}% tax
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Min ROI %</Label>
                <Input className="mt-1 h-9" type="number" value={form.minRoi ?? ''} onChange={(e) => setForm((f) => ({ ...f, minRoi: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Min profit $</Label>
                <Input className="mt-1 h-9" type="number" value={form.minProfit ?? ''} onChange={(e) => setForm((f) => ({ ...f, minProfit: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Max BSR</Label>
                <Input className="mt-1 h-9" type="number" value={form.maxBsr ?? ''} onChange={(e) => setForm((f) => ({ ...f, maxBsr: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Monthly buy budget</Label>
                <Input className="mt-1 h-9" type="number" value={form.monthlyBudget ?? ''} onChange={(e) => setForm((f) => ({ ...f, monthlyBudget: e.target.value }))} />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-600">Prep cost / unit</Label>
                <Input className="mt-1 h-9" type="number" step="0.05" value={form.prepCost ?? ''} onChange={(e) => setForm((f) => ({ ...f, prepCost: e.target.value }))} />
                <p className="mt-1 text-[10px] text-slate-400">Fragile items are auto-bumped to $1.20.</p>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600">Inbound shipping / unit</Label>
                <Input className="mt-1 h-9" type="number" step="0.05" value={form.inboundCost ?? ''} onChange={(e) => setForm((f) => ({ ...f, inboundCost: e.target.value }))} />
                <p className="mt-1 text-[10px] text-slate-400">Feeds the fee engine on every recompute.</p>
              </div>
            </div>

            <Button className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-500" onClick={save} disabled={busy}>
              <Save className="h-4 w-4" /> Save settings
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-800">Exclusion lists (FR-4.5)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600">Blocked brands ({excludedBrands.length})</Label>
              <div className="mt-1.5 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                {excludedBrands.length === 0 && <p className="text-xs text-slate-400">None — add brands with IP-claim or litigation patterns.</p>}
                {excludedBrands.map((b) => (
                  <Badge key={b} variant="secondary" className="gap-1 bg-red-50 text-red-700 hover:bg-red-50">
                    {b}
                    <button onClick={() => removeExclusion('brands', b)} aria-label={`Remove ${b}`}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600">Blocked ASINs ({excludedAsins.length})</Label>
              <div className="mt-1.5 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                {excludedAsins.length === 0 && <p className="text-xs text-slate-400">None — add ASINs you never want surfaced.</p>}
                {excludedAsins.map((a) => (
                  <Badge key={a} variant="secondary" className="gap-1 bg-red-50 text-red-700 hover:bg-red-50">
                    {a}
                    <button onClick={() => removeExclusion('asins', a)} aria-label={`Remove ${a}`}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Input placeholder="Brand name or ASIN…" value={brandInput} onChange={(e) => setBrandInput(e.target.value)} />
              <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => addExclusion(/^[A-Z0-9]{10}$/i.test(brandInput.trim()) ? 'asins' : 'brands')} disabled={!brandInput.trim()}>
                <Plus className="h-3.5 w-3.5" /> Exclude
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-slate-800">Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-slate-600">
            <div className="flex items-center justify-between">
              <span>Plan</span>
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{PLANS[s.plan].name}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>VA sub-accounts (FR-7.2)</span>
              <span className="font-medium">{PLANS[s.plan].subAccounts} included</span>
            </div>
            <div className="flex items-center justify-between">
              <span>API access (FR-8.3)</span>
              <span className="font-medium">{PLANS[s.plan].api ? 'Enabled — key in Expert settings' : 'Pro+ feature'}</span>
            </div>
            <Separator />
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={replayOnboarding}>
                <RotateCcw className="h-3.5 w-3.5" /> Replay onboarding
              </Button>
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={resetDemo} disabled={seeding}>
                <Trash2 className="h-3.5 w-3.5" /> {seeding ? 'Rebuilding…' : 'Reset demo data'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
