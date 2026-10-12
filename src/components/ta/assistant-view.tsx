'use client';

// Conversational demo assistant (investor-demo AI feature set #6).
// Chat UI only — the intelligence lives in /api/assistant, which composes every
// reply from deal-store rows (retrieval-grounded; no open-ended generation).
// Results render as tap-through cards that open the same evidence-linked detail
// sheet as AI Picks.

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api, type AssistantResponseDTO } from '@/lib/ta/api';
import type { PickDTO } from '@/lib/ta/ai/types';
import { ConfidenceBadge } from './ai-bits';
import { VerdictPill } from './opportunity-verdict';
import { DealDetailSheet } from './deal-detail-sheet';
import { ProductImage } from './product-image';
import { useVoice } from './use-voice';
import { useToast } from '@/hooks/use-toast';
import { BotMessageSquare, Mic, MicOff, Send, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { fmtMoney } from '@/lib/ta/profit';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  items?: PickDTO[];
  suggestions?: string[];
  chips?: { label: string }[];
  unmatched?: string[];
  tookMs?: number;
}

function ResultRow({ pick, onOpen }: { pick: PickDTO; onOpen: (p: PickDTO) => void }) {
  const { lead, confidence, verdict } = pick;
  return (
    <button
      type="button"
      onClick={() => onOpen(pick)}
      className="flex w-full items-start gap-3 rounded-xl border border-border bg-card p-2.5 text-left transition-colors hover:bg-accent/50"
      aria-label={`Open ${lead.title}`}
    >
      <ProductImage imageKey={lead.imageUrl} title={lead.title} category={lead.category} className="h-14 w-14 shrink-0 rounded-lg text-base" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug">{lead.title}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {lead.retailerName} · {lead.asin}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-[13px] font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(lead.netProfit)}</span>
          <span className="text-xs font-semibold">{Math.round(lead.roiPct)}% ROI</span>
          <ConfidenceBadge confidence={confidence} />
          {verdict && <VerdictPill verdict={verdict.verdict} confidence={verdict.confidence} />}
        </div>
      </div>
    </button>
  );
}

const md = {
  p: (props: any) => <p className="text-[13px] leading-relaxed" {...props} />,
  strong: (props: any) => <strong className="font-bold text-foreground" {...props} />,
  li: (props: any) => <li className="ml-4 list-disc text-[13px] leading-relaxed" {...props} />,
  ol: (props: any) => <ol className="space-y-0.5" {...props} />,
  ul: (props: any) => <ul className="space-y-0.5" {...props} />,
} as const;

export function AssistantView() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [detailPick, setDetailPick] = useState<PickDTO | null>(null);
  const lastParseRef = useRef<AssistantResponseDTO['parse'] | null>(null);
  // conversation anchor: last product the assistant showed — resolves "it/this" on follow-ups
  const contextLeadRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const voice = useVoice((text) => {
    setInput(text);
    inputRef.current?.focus();
  });

  // grounded greeting from the live picks snapshot (never invented client-side)
  useEffect(() => {
    let cancelled = false;
    api
      .picks(false)
      .then((res) => {
        if (cancelled) return;
        const top = res.picks[0];
        setMessages([
          top
            ? {
                role: 'assistant',
                content: [
                  `Hi — I'm the demo assistant. I answer **only** from your live deal store, so everything I say can be traced to data.`,
                  `Today's #1 pick: **${top.lead.title.slice(0, 70)}** — ${fmtMoney(top.lead.netProfit)} net, ${Math.round(top.lead.roiPct)}% ROI, ${top.confidence.band} confidence (${Math.round(top.confidence.p * 100)}%).`,
                  top.verdict ? `Verdict on it: **${top.verdict.verdict.replace('_', ' ')}** (${top.verdict.confidence}%).` : '',
                  `Ask me anything — search deals in plain English, or drill into any pick.`,
                ]
                  .filter(Boolean)
                  .join('\n'),
                items: res.picks.slice(0, 2),
                suggestions: [
                  `Why is ${top.lead.title.slice(0, 60)} ranked first?`,
                  'Should I buy it now or wait?',
                  'Show electronics deals under $35 high confidence',
                  'How many fresh deals under $30?',
                ],
              }
            : {
                role: 'assistant',
                content: `Hi — I'm the demo assistant. I answer **only** from your live deal store. Try asking for deals in plain English, or give a product a buy-or-wait verdict.`,
                suggestions: ['What are my top picks today?', 'Show electronics deals under $35', 'Show grocery deals 40%+ roi'],
              },
        ]);
        if (top) contextLeadRef.current = top.leadId;
      })
      .catch(() => !cancelled && setMessages([{ role: 'assistant', content: 'Deal store is still spinning up — try one of the suggestions below in a moment.' }]));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (messages.length > 1) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, busy]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy) return;
      const outgoing: ChatMsg[] = [{ role: 'user', content }];
      const next = [...messages, ...outgoing];
      setMessages(next);
      setInput('');
      setBusy(true);
      try {
        const res = await api.assistant({
          messages: next.map((m) => ({ role: m.role, content: m.content })).slice(-10),
          prev: lastParseRef.current ?? undefined,
          contextLeadId: contextLeadRef.current,
        });
        lastParseRef.current = res.parse;
        if (res.items.length > 0) contextLeadRef.current = res.items[0].leadId;
        setMessages((ms) => [
          ...ms,
          {
            role: 'assistant',
            content: res.reply,
            items: res.items,
            suggestions: res.suggestions,
            chips: res.parse.chips,
            unmatched: res.parse.unmatched,
            tookMs: res.tookMs,
          },
        ]);
      } catch (e) {
        toast({ title: 'Assistant error', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
        setMessages((ms) => [...ms, { role: 'assistant', content: 'I hit an error reading the deal store — ask again and I\'ll retry.' }]);
      } finally {
        setBusy(false);
      }
    },
    [messages, busy, toast]
  );

  const busyGreeting = messages.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-3 md:px-4">
      <header className="space-y-1 pb-2 pt-3">
        <h1 className="flex items-center gap-1.5 text-lg font-bold leading-tight">
          <BotMessageSquare className="h-5 w-5 text-emerald-500" /> Demo Assistant
        </h1>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
          Tool-using & retrieval-grounded — every reply cites live deal-store data; no open-ended generation.
        </p>
      </header>

      {/* conversation */}
      <div className="flex-1 space-y-3 pb-[calc(env(safe-area-inset-bottom)+10.5rem)] pt-1 md:pb-24">
        {busyGreeting ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-3/4 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
          </div>
        ) : null}
        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[92%] space-y-2 rounded-2xl border px-3.5 py-2.5',
                m.role === 'user' ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-border bg-card'
              )}
            >
              <div className="[&_p+p]:mt-1.5">
                <ReactMarkdown components={md as any}>{m.content}</ReactMarkdown>
              </div>

              {m.role === 'assistant' && m.chips && m.chips.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {m.chips.map((c, j) => (
                    <span key={j} className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      {c.label}
                    </span>
                  ))}
                  {m.unmatched?.slice(0, 3).map((u) => (
                    <span key={u} className="rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] text-muted-foreground" title="not understood — not applied">
                      {u}?
                    </span>
                  ))}
                </div>
              )}

              {m.role === 'assistant' && m.items && m.items.length > 0 && (
                <div className="space-y-2 pt-0.5">
                  {m.items.map((p) => (
                    <ResultRow key={p.leadId} pick={p} onOpen={setDetailPick} />
                  ))}
                </div>
              )}

              {m.role === 'assistant' && m.suggestions && m.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {m.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy}
                      onClick={() => void send(s)}
                      className="rounded-full border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors enabled:hover:bg-accent enabled:hover:text-foreground disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {m.role === 'assistant' && m.tookMs != null && <p className="pt-0.5 text-[10px] text-muted-foreground">computed in {m.tookMs}ms · grounded in stored scan data</p>}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-border bg-card px-3.5 py-2.5">
              <p className="animate-pulse text-[13px] text-muted-foreground">Checking the deal store…</p>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* composer — sticky above the mobile tab bar */}
      <div className="sticky bottom-[4.25rem] z-20 -mx-3 border-t border-border bg-background/95 px-3 py-2.5 backdrop-blur md:-mx-4 md:bottom-2 md:px-4">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about any product or opportunity…"
            className="h-12 text-[15px]"
            aria-label="Ask the demo assistant"
            enterKeyHint="send"
          />
          {voice.supported ? (
            <Button
              type="button"
              size="icon"
              aria-label={voice.listening ? 'Stop voice input' : 'Start voice input'}
              className={cn('h-12 w-12 shrink-0', voice.listening ? 'animate-pulse bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500')}
              onClick={() => (voice.listening ? voice.stop() : voice.start())}
            >
              {voice.listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>
          ) : null}
          <Button type="submit" size="icon" className="h-12 w-12 shrink-0 bg-emerald-600 hover:bg-emerald-500" disabled={busy} aria-label="Send message">
            <Send className="h-5 w-5" />
          </Button>
        </form>
      </div>

      <DealDetailSheet pick={detailPick} onClose={() => setDetailPick(null)} onChanged={() => {}} />
    </div>
  );
}