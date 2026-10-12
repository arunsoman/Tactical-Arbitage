// Demo Assistant (investor-demo AI feature set #6) — conversational, but
// STRICTLY tool-using / retrieval-based: every reply is composed from deal-store
// rows fetched in this request. There is no open-ended generation and no LLM
// dependency — deterministic composition (cost ≈ 0, zero hallucination by design).
//
// Intents: capabilities · stats · why-ranked · buy-or-wait verdict · ranked
// search (same AI pipeline as Picks) · honest fallback (never invents).

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { parseNlQuery, mergeNl } from '@/lib/ta/ai/nl';
import { buildRankingContext } from '@/lib/ta/ai/context';
import { rankedLeadSearch, toPickDTO, verdictForLead } from '@/lib/ta/ai/leadQuery';
import { buildReasons, calibratedConfidence } from '@/lib/ta/ai/ranking';
import { withLatency } from '@/lib/ta/ai/instrument';
import type { Lead } from '@prisma/client';
import type { NlParseResult, PickDTO } from '@/lib/ta/ai/types';

export const dynamic = 'force-dynamic';

const money = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

const QUESTION_WORDS = /\b(what|whats|whats|how|why|should|tell|about|this|that|these|those|it|its|any|have|got|give|show|find|does|do|is|are|were|you|your|worth|buy|bought|wait|skip|rank|ranked|rank|pick|picks|deal|deals|opportunity|opportunities|verdict|opinion|thoughts|recommend|now|today|please|help|me|my|i|and|or|the|a|an|of|for|to)\b/g;

/** strip question scaffolding → candidate product tokens */
function productTokens(q: string): string[] {
  const s = q.toLowerCase().replace(QUESTION_WORDS, ' ').replace(/[^a-z0-9 ]/g, ' ');
  const tokens = Array.from(new Set(s.split(/\s+/).filter((t) => t.length >= 3 && !/^\d+$/.test(t))));
  tokens.sort((a, b) => b.length - a.length); // most specific first
  return tokens.slice(0, 4);
}

async function matchLead(tokens: string[]): Promise<Lead | null> {
  if (tokens.length === 0) return null;
  const rows = await db.lead.findMany({
    where: { OR: tokens.flatMap((t) => [{ title: { contains: t } }, { brand: { contains: t } }]) },
    orderBy: { score: 'desc' },
    take: 80,
  });
  let best: Lead | null = null;
  let bestS = 0;
  for (const r of rows) {
    const title = r.title.toLowerCase();
    const brand = r.brand.toLowerCase();
    let hits = 0;
    for (const t of tokens) if (title.includes(t) || brand === t || brand.includes(t)) hits += 1;
    const s = hits * 1000 + r.score;
    if (hits > 0 && s > bestS) {
      bestS = s;
      best = r;
    }
  }
  return best;
}

async function rankOfInPicksSnapshot(leadId: string): Promise<number | null> {
  const snap = await db.pickSnapshot.findFirst({ orderBy: { generatedAt: 'desc' } });
  if (!snap) return null;
  try {
    const payload = JSON.parse(snap.payloadJson) as { picks: PickDTO[] };
    const idx = payload.picks.findIndex((p) => p.leadId === leadId);
    return idx >= 0 ? idx + 1 : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body.messages)
      ? (body.messages as { role: 'user' | 'assistant'; content: string }[]).slice(-12)
      : [];
    const lastUser = [...messages].reverse().find((m) => m?.role === 'user' && typeof m.content === 'string');
    const q = (lastUser?.content ?? '').slice(0, 300).trim();
    if (!q) return NextResponse.json({ error: 'a user message is required' }, { status: 400 });
    // client anchor: the product shown in the last assistant turn (pronoun resolution)
    const contextLeadId = typeof body.contextLeadId === 'string' ? body.contextLeadId : null;

    const t0 = Date.now();
    const ctx = await buildRankingContext();
    const retailers = await db.retailer.findMany({ select: { id: true, name: true } });
    const prev = body.prev && typeof body.prev === 'object' && (body.prev as NlParseResult).filters
      ? (body.prev as NlParseResult)
      : null;

    const lc = q.toLowerCase();
    const isCapabilities =
      /^(hi|hey|hello|yo)\b|what can you do|help me|how do (you|u) work|what are you|who are you|what do you do|capabilities|what is this/.test(lc);
    const wantsStats = /\bhow many\b|\bcount\b|\bhow much\b.*\bsales\b/.test(lc);
    const wantsVerdict =
      /should i (buy|wait|skip|pass)|buy (this|it|now|today)|worth (buying|it)|buy or wait|or wait|verdict|opinion|recommend.*buy/.test(lc);
    const wantsWhy = /\bwhy\b|\bexplain\b|reasoning|how.*determin/.test(lc);

    let mode: 'search' | 'verdict' | 'why' | 'stats' | 'capabilities' | 'fallback' = 'fallback';
    let reply = '';
    let items: PickDTO[] = [];
    let suggestions: string[] = [];
    let parsedForTurn = parseNlQuery(q, retailers);
    if (prev) parsedForTurn = mergeNl(prev, parsedForTurn); // refinement memory (same as NL search)

    const capFooter = `Strictly tool-using: ${ctx.purchaseOutcomeCount} logged outcomes behind calibration · ${await db.lead.count({ where: { fresh: true } })} fresh leads live in the store. No open-ended generation.`;

    if (isCapabilities) {
      mode = 'capabilities';
      reply = [
        `I'm the demo assistant — I can only answer from your live deal store, never from general knowledge. Concretely:`,
        `• **Search deals in plain English** — "electronics under $35 high confidence", then refine ("no gated").`,
        `• **Give a buy-or-wait verdict** on any product, with a fair-price meter and both-sided reasons.`,
        `• **Explain any ranking** — why a pick is #1, down to the evidence chain.`,
        `While you decide: today's #1 pick is ranked by net profit, price position and your logged wins.`,
      ].join('\n');
      suggestions = ['Show electronics deals under $35 high confidence', 'What are my top picks today?', 'Show grocery deals 40%+ roi'];
    } else if (wantsStats) {
      mode = 'stats';
      const { results, total } = await rankedLeadSearch(parsedForTurn, ctx, 25);
      const whereLabel = parsedForTurn.chips.length ? parsedForTurn.chips.map((c) => c.label).join(', ') : 'your active filters';
      reply = [
        results.length > 0
          ? `**${total}** fresh leads match (${whereLabel}). The best of them: **${results[0].lead.title}** at ${results[0].lead.retailerName} — **${money(results[0].lead.netProfit)} net** (${Math.round(results[0].lead.roiPct)}% ROI) at ${results[0].confidence.band} confidence (${pct(results[0].confidence.p)}).`
          : `No fresh leads match (${whereLabel}). That's the honest count — I won't pad it.`,
      ].join('\n');
      items = results.slice(0, 3);
      suggestions = results.length > 0 ? ['Show these ranked', 'Why is the top one ranked first?', `Only high confidence`] : ['Show all fresh deals', 'Show electronics under $35'];
    } else {
      const tokens = productTokens(q);
      // --- product resolution with conversation context ---
      // "Should I buy it now or wait?" must resolve "it" to what we were just
      // discussing: the client anchors to the last-shown product, and prior user
      // turns are scanned for a product mention before this becomes a generic
      // search. Without a match after these attempts, it falls through to search.
      const hasPronounRef = /\b(it|this|that|them|these|those|the deal|the pick|one)\b/.test(lc);
      let lead: Lead | null = null;

      if (contextLeadId && (tokens.length === 0 || hasPronounRef)) {
        const anchored = await db.lead.findUnique({ where: { id: contextLeadId } });
        if (anchored) lead = anchored;
      }
      if (!lead && tokens.length === 0 && hasPronounRef) {
        const prevUserMsgs = messages.filter((m) => m.role === 'user' && m.content !== q).map((m) => m.content);
        for (let i = prevUserMsgs.length - 1; i >= 0 && !lead; i--) {
          const pt = productTokens(prevUserMsgs[i]);
          if (pt.length > 0) lead = await matchLead(pt);
        }
      } else if (tokens.length > 0) {
        lead = await matchLead(tokens);
      }

      // structural filter chips distinguish genuine deal searches from question
      // scaffolding — a pure question with no product anchor never becomes a
      // doomed keyword search; it lands on the honest fallback instead.
      const structuralChips = parsedForTurn.chips.filter((c) => c.kind !== 'search').length;
      if (!lead && tokens.length === 0 && structuralChips === 0) {
        mode = 'fallback';
        const alt = await rankedLeadSearch(parseNlQuery(''), ctx, 3);
        reply = [
          `I couldn't resolve that to a product or a deal query — I only answer from the deal store, so I won't improvise.`,
          `Ask me about a specific product ("Should I buy {name} now or wait?", "Why is {name} ranked first?") or a deal search ("electronics under $35 high confidence").`,
          alt.results.length > 0 ? `Meanwhile, today's strongest leads: ${alt.results.map((p) => `**${p.lead.title.slice(0, 48).trim().replace(/[\s,.;:]+$/, '')}** (${money(p.lead.netProfit)} net)`).join(' · ')}.` : '',
        ]
          .filter(Boolean)
          .join('\n\n');
        items = alt.results;
        suggestions = ['What are my top picks today?', 'Show electronics deals under $35 high confidence', 'How many fresh deals under $30?'];
      } else if (lead) {
        const listing = await db.amazonListing.findUnique({ where: { asin: lead.asin } });
        const confidence = calibratedConfidence(lead.score, ctx.calibration);
        const { reason, factors } = buildReasons(lead, confidence, {
          listing: listing ? { priceStability: listing.priceStability, keepa30Avg: listing.keepa30Avg, rankTrend: listing.rankTrend } : undefined,
          affinity: ctx.affinity,
          minRoi: ctx.settings.minRoi,
          priceAgeH: lead.priceAgeH,
        });
        const verdict = verdictForLead(lead, listing?.historyJson, ctx.settings.minRoi);
        const one = toPickDTO({ lead, aiScore: lead.score, confidence, reason, factors }, 0, ctx.strength, false, verdict);

        if (wantsVerdict) {
          mode = 'verdict';
          const vSent =
            verdict.verdict === 'BUY_NOW'
              ? 'the ledger lands firmly on **BUY NOW**'
              : verdict.verdict === 'WAIT'
                ? 'the balance of the evidence says **WAIT**'
                : 'there are hard disqualifiers, so the verdict is **AVOID**';
          reply = [
            `On **${lead.title}** (${lead.asin}): ${vSent} — ${verdict.confidence}% confidence.`,
            `**Why buy:** ${verdict.buyReasons[0]}`,
            `**Why wait:** ${verdict.waitReasons[0]}`,
            `Fair-price meter: the sell price sits at the **${verdict.fairPercentile}th percentile** of its 90-day range (${money(verdict.priceLow90)}–${money(verdict.priceHigh90)}).`,
          ].join('\n\n');
          items = [one];
          suggestions = [`Why do you recommend this rank?`, `Show me other ${lead.category.toLowerCase()} picks`, `Show everything under ${Math.ceil(lead.retailerPrice)}`];
        } else if (wantsWhy) {
          mode = 'why';
          const rank = await rankOfInPicksSnapshot(lead.id);
          const rankLine = rank
            ? `It's currently your **#${rank} AI pick**.`
            : `It isn't in today's top picks (it still matches your scan filters).`;
          reply = [
            `${rankLine} The ranking is a deterministic blend you can audit — its strongest drivers here:`,
            ...factors.slice(0, 4).map((f, i) => `${i + 1}. ${f.label}`),
            `Calibrated confidence: **${confidence.band}** (${pct(confidence.p)}) from ${confidence.sampleSize} logged outcomes (${confidence.method}).`,
          ].join('\n');
          items = [one];
          suggestions = ['Should I buy this now or wait?', 'Show me cheaper alternatives', 'Show me other picks'];
        } else {
          // "what about X" / generic product mention → treat as a mini-verdict + summary
          mode = 'verdict';
          reply = [
            `${lead.title.slice(0, 90)}${lead.title.length > 90 ? '…' : ''} — ${money(lead.netProfit)} net, ${Math.round(lead.roiPct)}% ROI, ${lead.retailerName} → Amazon.`,
            `Verdict: **${verdict.verdict.replace('_', ' ')}** (${verdict.confidence}%). ${verdict.buyReasons[0]}`,
            `Counterweight: ${verdict.waitReasons[0]}`,
          ].join('\n');
          items = [one];
          suggestions = ['Why is it ranked like this?', 'Should I buy it now or wait?', `Show me other ${lead.category.toLowerCase()} deals`];
        }
      } else {
        // no product matched → deterministic ranked search on the parsed filters
        mode = 'search';
        const { results, total, tookMs: searchMs } = await rankedLeadSearch(parsedForTurn, ctx, 25);
        items = results.slice(0, 6);
        const chips = parsedForTurn.chips.map((c) => c.label).join(', ');
        if (results.length > 0) {
          const top = results[0];
          const second = results[1];
          reply = [
            `Found **${results.length}** ranked matches of ${total} candidates${chips ? ` — parsed: ${chips}` : ''} (sorted, evidence-linked, in ${searchMs}ms).`,
            `**Top match: ${top.lead.title}** at ${top.lead.retailerName} — ${money(top.lead.netProfit)} net, ${Math.round(top.lead.roiPct)}% ROI, ${top.confidence.band} confidence (${pct(top.confidence.p)}). ${top.reason}`,
            second ? `Runner-up: ${second.lead.title} — ${money(second.lead.netProfit)} net at ${second.lead.retailerName}.` : '',
          ]
            .filter(Boolean)
            .join('\n\n');
          suggestions = ['only high confidence', 'under $25', 'no gated', 'sort by highest profit', 'how many match this'];
        } else {
          mode = 'fallback';
          const alt = await rankedLeadSearch(parseNlQuery(''), ctx, 3);
          reply = [
            `Nothing in the deal store matches that — I won't invent results.`,
            alt.results.length > 0 ? `For comparison, today's strongest leads right now: ${alt.results.map((p) => `**${p.lead.title.slice(0, 48).trim().replace(/[\s,.;:]+$/, '')}** (${money(p.lead.netProfit)} net)`).join(' · ')}.` : '',
            `Try widening a constraint — e.g. "${'under $40 fresh electronics'}".`,
          ]
            .filter(Boolean)
            .join('\n\n');
          items = alt.results;
          suggestions = ['Show all fresh deals under $40', 'Show electronics under $35 high confidence', 'What are my top picks today?'];
        }
      }
    }

    // Pronoun/verdict/why turns resolve products via the conversation anchor —
    // carried keyword-search strings would poison later refinements, so they are
    // scrubbed from parse memory (and display chips) for non-search modes.
    const scrubSearch = mode !== 'search' && mode !== 'stats';
    const payloadOut = {
      reply,
      items,
      mode,
      parse: {
        filters: scrubSearch ? { ...parsedForTurn.filters, search: '' } : parsedForTurn.filters,
        sort: parsedForTurn.sort,
        chips: scrubSearch ? parsedForTurn.chips.filter((c) => c.kind !== 'search') : parsedForTurn.chips,
        unmatched: parsedForTurn.unmatched,
        minConfidence: parsedForTurn.minConfidence,
        recencyHours: parsedForTurn.recencyHours,
      },
      suggestions,
      tookMs: Date.now() - t0,
      groundedWith: { totalCandidates: items.length, outcomeCount: ctx.purchaseOutcomeCount },
      footer: capFooter,
    };
    const { result: payload, ms } = await withLatency('ASSIST', () => payloadOut);
    void ms;
    return NextResponse.json(payload);
  } catch (err) {
    console.error('assistant failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'assistant failed' }, { status: 500 });
  }
}