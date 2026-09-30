// Natural-language deal search (§4 US-5): deterministic parse → deal-store query
// → AI-ranked results with reasons. Refinements merge server-verified chips so
// context is never lost between turns.

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { buildLeadWhere, postFilterRiskFlags } from '@/lib/ta/filters';
import { sanitizeFilters } from '@/lib/ta/types';
import { parseNlQuery, mergeNl, confidenceFloor } from '@/lib/ta/ai/nl';
import { buildRankingContext } from '@/lib/ta/ai/context';
import { buildReasons, calibratedConfidence, estMonthlySales, rankCandidates } from '@/lib/ta/ai/ranking';
import { withLatency } from '@/lib/ta/ai/instrument';
import type { Lead } from '@prisma/client';
import type { PickDTO } from '@/lib/ta/ai/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const q = typeof body.q === 'string' ? body.q.slice(0, 200) : '';
    const prev = body.prev && typeof body.prev === 'object' ? body.prev : null;

    const retailers = await db.retailer.findMany({ select: { id: true, name: true } });
    let parsed = parseNlQuery(q, retailers);
    if (prev) parsed = mergeNl(prev, parsed); // follow-up refinement keeps context (US-5 AC)

    const ctx = await buildRankingContext();
    const where = buildLeadWhere(sanitizeFilters(parsed.filters), ctx.settings);
    if (parsed.recencyHours != null) {
      // narrow the recency intent on top of the base filter
      (where as { AND?: unknown[] }).AND = [
        ...(((where as { AND?: unknown[] }).AND as unknown[]) ?? []),
        { priceAgeH: { lte: parsed.recencyHours } },
      ];
    }

    const rows = await db.lead.findMany({ where, orderBy: { score: 'desc' }, take: 300 });

    // Risk-flag exclusions are JSON-encoded → post-filter (documented deal-store trade-off).
    let filtered: Lead[] = postFilterRiskFlags(rows, parsed.filters.excludeFlags);

    // Re-rank through the same AI pipeline used for picks (identical semantics).
    const { ranked } = rankCandidates({
      leads: filtered,
      listings: new Map(),
      calibration: ctx.calibration,
      affinity: ctx.affinity,
      suppressions: ctx.suppressionLists,
      health: ctx.health,
      settings: ctx.settings,
    });
    filtered = [];

    const floor = confidenceFloor(parsed.minConfidence);
    const confidenceFiltered = ranked.filter((r) => r.confidence.p >= floor).slice(0, 25);

    const listingIds = Array.from(new Set(confidenceFiltered.map((r) => r.lead.listingId)));
    const listings = listingIds.length
      ? await db.amazonListing.findMany({
          where: { id: { in: listingIds } },
          select: { id: true, priceStability: true, keepa30Avg: true, rankTrend: true },
        })
      : [];
    const listingById = new Map(listings.map((l) => [l.id, l]));

    const { result: withReasons, ms: nlMs } = await withLatency('NL', () =>
      Promise.resolve(
        confidenceFiltered.map(({ lead, aiScore, confidence }, i) => {
          const { reason, factors } = buildReasons(lead, confidence, {
            listing: listingById.get(lead.listingId),
            affinity: ctx.affinity,
            minRoi: ctx.settings.minRoi,
            priceAgeH: lead.priceAgeH,
          });
          const dto: PickDTO = {
            leadId: lead.id,
            rank: i + 1,
            aiScore,
            baseScore: lead.score,
            confidence,
            reason,
            factors,
            personalization: ctx.strength,
            lead: {
              id: lead.id,
              asin: lead.asin,
              title: lead.title,
              brand: lead.brand,
              category: lead.category,
              imageUrl: lead.imageUrl,
              retailerId: lead.retailerId,
              retailerName: lead.retailerName,
              retailerPrice: lead.retailerPrice,
              buyBox: lead.buyBox,
              netProfit: lead.netProfit,
              roiPct: lead.roiPct,
              marginPct: lead.marginPct,
              breakeven: lead.breakeven,
              discountPct: lead.discountPct,
              bsr: lead.bsr,
              fbaOffers: lead.fbaOffers,
              riskFlags: lead.riskFlags,
              score: lead.score,
              priceAgeH: lead.priceAgeH,
              fresh: lead.fresh,
              firstSeenAt: lead.firstSeenAt.toISOString(),
            },
            inPipeline: false,
            estMonthlySales: estMonthlySales(lead.bsr),
          };
          return dto;
        })
      )
    );

    // fill pipeline state for CTA display
    const pipelineItems = await db.pipelineItem.findMany({ select: { leadId: true } });
    const pset = new Set(pipelineItems.map((p) => p.leadId));
    const results = withReasons.map((r) => ({ ...r, inPipeline: pset.has(r.leadId) }));

    return NextResponse.json({
      parse: {
        chips: parsed.chips,
        unmatched: parsed.unmatched,
        minConfidence: parsed.minConfidence,
        recencyHours: parsed.recencyHours,
      },
      results,
      total: ranked.length,
      tookMs: Math.round(nlMs * 10) / 10,
      calibratedWith: ctx.calibration.totalOutcomes,
    });
  } catch (err) {
    console.error('nl search failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'nl search failed' }, { status: 500 });
  }
}

// keep the calibration import referenced for type clarity
void calibratedConfidence;
