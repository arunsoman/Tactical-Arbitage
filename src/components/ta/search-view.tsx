'use client';

// Natural-language deal search (§4 US-5): voice or typed queries, parsed chips
// shown honestly (including anything unmatched), follow-up refinements merge
// without losing context, results ranked through the same AI pipeline as Picks.

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type NlSearchResponseDTO } from '@/lib/ta/api';
import type { PickDTO } from '@/lib/ta/ai/types';
import { PickCard } from './pick-card';
import { DealDetailSheet } from './deal-detail-sheet';
import { useVoice } from './use-voice';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Mic, MicOff, Search, Sparkles, X } from 'lucide-react';

const EXAMPLES = [
  'new electronics under $35 high confidence last 8 hours',
  'pet supplies highest profit no gated',
  'grocery 30%+ roi bsr under 50000 fresh today',
  'beauty over $20 best roi',
];

export function SearchView() {
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [data, setData] = useState<NlSearchResponseDTO | null>(null);
  const [prevParse, setPrevParse] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<PickDTO | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = useCallback(
    async (query: string, prev?: unknown) => {
      if (!query.trim()) return;
      setLoading(true);
      try {
        const res = await api.nlSearch(query, prev);
        setData(res);
        setPrevParse(res.parse);
      } catch (e) {
        toast({ title: 'Search failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  const voice = useVoice((text) => {
    setQ(text);
    void run(text);
  });

  useEffect(() => {
    if (!voice.listening && voice.supported) inputRef.current?.focus();
  }, [voice.listening, voice.supported]);

  const clearAll = () => {
    setQ('');
    setData(null);
    setPrevParse(null);
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 px-3 pb-24 pt-3 md:px-4">
      <header>
        <h1 className="text-lg font-bold leading-tight">Ask for deals</h1>
        <p className="text-xs text-muted-foreground">Voice or text — refinements build on the previous query</p>
      </header>

      {/* query bar with voice */}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(q, prevParse);
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='e.g. "new electronics under $35 high confidence"'
            className="h-12 pl-9 pr-9 text-[15px]"
            aria-label="Natural language deal query"
            enterKeyHint="search"
          />
          {q && (
            <button type="button" aria-label="clear query" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={clearAll}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {voice.supported ? (
          <Button
            type="button"
            size="icon"
            aria-label={voice.listening ? 'Stop voice input' : 'Start voice input'}
            className={cn('h-12 w-12', voice.listening ? 'animate-pulse bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500')}
            onClick={() => (voice.listening ? voice.stop() : voice.start())}
          >
            {voice.listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Button>
        ) : (
          <Button type="button" size="icon" variant="outline" disabled aria-label="Voice input not supported in this browser" className="h-12 w-12">
            <MicOff className="h-5 w-5" />
          </Button>
        )}
        <Button type="submit" className="h-12 bg-emerald-600 px-5 font-semibold hover:bg-emerald-500" disabled={loading}>
          {loading ? '…' : 'Search'}
        </Button>
      </form>
      {voice.listening && <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400" role="status">Listening… speak your query</p>}
      {!voice.supported && <p className="text-[11px] text-muted-foreground">Voice input needs a Chromium browser — typing works everywhere.</p>}

      {/* example chips */}
      {!data && !loading && (
        <div className="flex flex-wrap gap-2 pt-1">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQ(ex);
                void run(ex);
              }}
              className="rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground transition-colors active:bg-accent"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {/* parsed chips — honest display of what was understood */}
      {data && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
            {data.parse.chips.length === 0 && <span className="text-xs text-muted-foreground">No filters parsed — showing keyword matches</span>}
            {data.parse.chips.map((c, i) => (
              <span key={i} className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                {c.label}
              </span>
            ))}
            {data.parse.unmatched.slice(0, 4).map((u) => (
              <span key={u} className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground" title="not understood — not applied">
                {u}?
              </span>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {data.results.length} ranked results of {data.total} candidates · parsed + ranked in {data.tookMs}ms · calibrated on {data.calibratedWith} outcomes
          </p>
        </div>
      )}

      {/* results */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        data && (
          <div className="space-y-3">
            {data.results.map((r) => (
              <PickCard key={r.leadId} pick={r} onOpen={setSelected} onSave={async (p) => {
                await api.saveToPipeline(p.leadId);
                toast({ title: 'Saved to pipeline' });
              }} />
            ))}
            {data.results.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Nothing matches that query — try removing a constraint or widening the price band.
              </p>
            )}
            <p className="pt-1 text-center text-[11px] text-muted-foreground">Refine by typing more, e.g. “under $25 no hazmat” — context carries over.</p>
          </div>
        )
      )}

      <DealDetailSheet pick={selected} onClose={() => setSelected(null)} onChanged={() => void run(q, prevParse)} />
    </div>
  );
}
