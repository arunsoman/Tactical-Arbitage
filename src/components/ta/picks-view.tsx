'use client';

// AI Picks — the default home screen (§10): thumb-scrollable ranked list of
// today's best opportunities, each with a one-line evidence-linked reason.
// Cached snapshot → instant load; stale snapshot → explicit badge (§7).

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type PicksResponseDTO } from '@/lib/ta/api';
import type { PickDTO } from '@/lib/ta/ai/types';
import { PickCard } from './pick-card';
import { DealDetailSheet } from './deal-detail-sheet';
import { OutcomeSheet, PendingOutcomeRow, type OutcomeSheetTarget } from './outcome-sheet';
import { HealthBanner, SafeModeBanner, StaleBadge } from './ai-bits';
import { useTAStore } from './store';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';

export function PicksView() {
  const { bumpDealRefresh } = useTAStore();
  const { toast } = useToast();
  const [data, setData] = useState<PicksResponseDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<PickDTO | null>(null);
  const [outcomeTarget, setOutcomeTarget] = useState<OutcomeSheetTarget | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Awaited<ReturnType<typeof api.pendingOutcomes>>['pending']>([]);

  const load = useCallback(async (refresh = false) => {
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await api.picks(refresh);
      setData(res);
      if (refresh) toast({ title: 'Picks re-ranked', description: `${res.picks.length} picks · rank ${res.meta.rankMs}ms · reasons ${res.meta.reasonMs}ms` });
    } catch (e) {
      toast({ title: 'Could not load picks', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    void load(false);
    api.pendingOutcomes().then((r) => setPending(r.pending.slice(0, 3))).catch(() => null);
  }, [load]);

  // onboarding just completed → re-rank immediately so cold-start banners clear
  const onboarded = useTAStore((s) => s.bootstrap?.settings.onboarded);
  const onboardedRef = useRef(onboarded);
  useEffect(() => {
    if (onboarded && !onboardedRef.current) {
      void load(true);
    }
    onboardedRef.current = onboarded;
  }, [onboarded, load]);

  const save = async (pick: PickDTO) => {
    try {
      await api.saveToPipeline(pick.leadId);
      setSavedIds((s) => new Set(s).add(pick.leadId));
      toast({ title: 'Saved to pipeline', description: 'Find it under Pipeline → New.' });
      bumpDealRefresh();
    } catch (e) {
      toast({ title: 'Could not save', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const refresh = () => load(true);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 px-3 pb-24 pt-3 md:px-4">
      {/* header */}
      <header className="flex items-center gap-2">
        <div>
          <h1 className="flex items-center gap-1.5 text-lg font-bold leading-tight">
            <Sparkles className="h-5 w-5 text-emerald-500" /> AI Picks
          </h1>
          <p className="text-xs text-muted-foreground">Today's best opportunities, ranked and evidence-linked</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {data?.meta.stale && <StaleBadge />}
          <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Re-rank picks now" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </Button>
        </div>
      </header>

      {/* trust context banners */}
      {data && <HealthBanner health={data.meta.health} />}
      {data && <SafeModeBanner coldStart={data.meta.coldStart} safeMode={data.meta.safeMode} personalization={data.meta.personalization} outcomeCount={data.meta.outcomeCount} />}

      {/* pending outcome prompts (learning health, §3) */}
      {pending.length > 0 && (
        <section className="space-y-2 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
          <p className="text-xs font-semibold">Log outcomes from recent purchases — it trains your ranking</p>
          {pending.map((p) => (
            <PendingOutcomeRow
              key={p.id}
              item={p}
              onOpen={() => {}}
              onQuickLog={(item) =>
                setOutcomeTarget({
                  leadId: item.lead.id,
                  title: item.lead.title,
                  buyBox: item.lead.buyBox,
                  totalCost: item.lead.totalCost,
                  roiPct: item.lead.roiPct,
                })
              }
            />
          ))}
        </section>
      )}

      {/* list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      ) : data && data.picks.length > 0 ? (
        <div className="space-y-3">
          {data.picks.map((pick) => (
            <PickCard key={pick.leadId} pick={pick} onOpen={setSelected} onSave={save} saved={savedIds.has(pick.leadId)} />
          ))}
          <p className="pt-1 text-center text-[11px] text-muted-foreground">
            Ranked from {data.meta.outcomeCount} logged outcomes · {data.meta.excludedStale} stale and {data.meta.excludedSuppressed} suppressed candidates hidden
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-8 text-center">
          <AlertTriangle className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No picks right now — run a scan cycle or relax your filters. Stale and suppressed leads never surface here.
          </p>
        </div>
      )}

      <DealDetailSheet pick={selected} onClose={() => setSelected(null)} onChanged={() => { void load(true); bumpDealRefresh(); }} />
      <OutcomeSheet target={outcomeTarget} onClose={() => setOutcomeTarget(null)} onLogged={() => { void load(true); setPending([]); }} />
    </div>
  );
}
