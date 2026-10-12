// Natural-language deal search (§4 US-5): deterministic parse → deal-store query
// → AI-ranked results with reasons and buy-or-wait verdicts. Refinements merge
// server-verified chips so context is never lost between turns. The response
// returns the full merged parse so the client can pass it back as `prev`.

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { parseNlQuery, mergeNl } from '@/lib/ta/ai/nl';
import { buildRankingContext } from '@/lib/ta/ai/context';
import { rankedLeadSearch } from '@/lib/ta/ai/leadQuery';
import { withLatency } from '@/lib/ta/ai/instrument';
import type { NlParseResult } from '@/lib/ta/ai/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const q = typeof body.q === 'string' ? body.q.slice(0, 200) : '';
    const prev = body.prev && typeof body.prev === 'object' && (body.prev as NlParseResult).filters
      ? (body.prev as NlParseResult)
      : null;

    const retailers = await db.retailer.findMany({ select: { id: true, name: true } });
    let parsed = parseNlQuery(q, retailers);
    if (prev) parsed = mergeNl(prev, parsed); // follow-up refinement keeps context (US-5 AC)

    const ctx = await buildRankingContext();
    const { result: ranked, ms: nlMs } = await withLatency('NL', () => rankedLeadSearch(parsed, ctx, 25));

    return NextResponse.json({
      // full parse (filters + sort included) so refinements can merge on the next turn
      parse: {
        filters: parsed.filters,
        sort: parsed.sort,
        chips: parsed.chips,
        unmatched: parsed.unmatched,
        minConfidence: parsed.minConfidence,
        recencyHours: parsed.recencyHours,
      },
      results: ranked.results,
      total: ranked.total,
      tookMs: Math.round(nlMs * 10) / 10,
      calibratedWith: ctx.calibration.totalOutcomes,
    });
  } catch (err) {
    console.error('nl search failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'nl search failed' }, { status: 500 });
  }
}