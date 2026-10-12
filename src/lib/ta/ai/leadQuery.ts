// Shared ranking query → PickDTO pipeline. Used by the NL search route and the
// demo assistant route so both surfaces return identical, evidence-linked DTOs.
// Verdicts (buy-or-wait) are computed alongside reasons — one pass, one store hit.

import { db } from '@/lib/db';
import { buildLeadWhere, postFilterRiskFlags } from '../filters';
import { sanitizeFilters, parseJsonArray } from '../types';
import { buildReasons, estMonthlySales, rankCandidates } from './ranking';
import { confidenceFloor } from './nl';
import { buildOpportunityVerdict, historyPrices } from './verdict';
import type { Lead } from '@prisma/client';
import type { PickDTO, PersonalizationStrength } from './types';
import type { OpportunityVerdict } from './verdict';
import type { RankingContext } from './context';
import type { NlParseResult } from './types';

/** Deterministic verdict for one lead from its stored history series. */
export function verdictForLead(lead: Lead, historyJson: string | undefined, minRoi: number): OpportunityVerdict {
  return buildOpportunityVerdict({
    retailerPrice: lead.retailerPrice,
    listPrice: lead.listPrice,
    couponPct: lead.couponPct,
    buyBox: lead.buyBox,
    netProfit: lead.netProfit,
    roiPct: lead.roiPct,
    breakeven: lead.breakeven,
    bsr: lead.bsr,
    fbaOffers: lead.fbaOffers,
    amazonRetail: lead.amazonRetail,
    riskFlags: parseJsonArray(lead.riskFlags),
    priceAgeH: lead.priceAgeH,
    fresh: lead.fresh,
    history: historyPrices(historyJson),
    minRoi,
    discountPct: lead.discountPct,
    estMonthlySales: estMonthlySales(lead.bsr),
  });
}

export function toPickDTO(
  r: { lead: Lead; aiScore: number; confidence: PickDTO['confidence']; reason: string; factors: PickDTO['factors'] },
  index: number,
  strength: PersonalizationStrength,
  inPipeline: boolean,
  verdict?: OpportunityVerdict
): PickDTO {
  const { lead } = r;
  return {
    leadId: lead.id,
    rank: index + 1,
    aiScore: r.aiScore,
    baseScore: lead.score,
    confidence: r.confidence,
    reason: r.reason,
    factors: r.factors,
    personalization: strength,
    ...(verdict ? { verdict } : {}),
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
    inPipeline,
    estMonthlySales: estMonthlySales(lead.bsr),
  };
}

export interface RankedLeadResult {
  results: PickDTO[];
  total: number;
  tookMs: number;
}

/**
 * Deterministic search: parse → deal-store where → AI rank → reasons + verdicts.
 * Same ranking semantics as AI Picks (identical calibration + suppression inputs).
 */
export async function rankedLeadSearch(parsed: NlParseResult, ctx: RankingContext, limit = 25): Promise<RankedLeadResult> {
  const where = buildLeadWhere(sanitizeFilters(parsed.filters), ctx.settings);
  if (parsed.recencyHours != null) {
    (where as { AND?: unknown[] }).AND = [
      ...(((where as { AND?: unknown[] }).AND as unknown[]) ?? []),
      { priceAgeH: { lte: parsed.recencyHours } },
    ];
  }

  const t0 = Date.now();
  const rows = await db.lead.findMany({ where, orderBy: { score: 'desc' }, take: 300 });
  let filtered: Lead[] = postFilterRiskFlags(rows, parsed.filters.excludeFlags);

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

  const confidenceFiltered = ranked.filter((r) => r.confidence.p >= confidenceFloor(parsed.minConfidence)).slice(0, limit);
  const total = ranked.length;

  const listingIds = Array.from(new Set(confidenceFiltered.map((r) => r.lead.listingId)));
  const listings = listingIds.length
    ? await db.amazonListing.findMany({
        where: { id: { in: listingIds } },
        select: { id: true, priceStability: true, keepa30Avg: true, rankTrend: true, historyJson: true },
      })
    : [];
  const listingById = new Map(listings.map((l) => [l.id, l]));

  const pipelineIds = new Set((await db.pipelineItem.findMany({ select: { leadId: true } })).map((p) => p.leadId));

  const results = confidenceFiltered.map(({ lead, aiScore, confidence }, i) => {
    const listing = listingById.get(lead.listingId);
    const { reason, factors } = buildReasons(lead, confidence, {
      listing: listing ? { priceStability: listing.priceStability, keepa30Avg: listing.keepa30Avg, rankTrend: listing.rankTrend } : undefined,
      affinity: ctx.affinity,
      minRoi: ctx.settings.minRoi,
      priceAgeH: lead.priceAgeH,
    });
    const verdict = verdictForLead(lead, listing?.historyJson, ctx.settings.minRoi);
    return toPickDTO({ lead, aiScore, confidence, reason, factors }, i, ctx.strength, pipelineIds.has(lead.id), verdict);
  });

  return { results, total, tookMs: Date.now() - t0 };
}