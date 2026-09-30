// AI-First v2.2 — picks orchestrator: hybrid ranking → calibrated picks with
// evidence reasons → snapshot cache for instant mobile cold starts (§7) →
// actionable notifications with deep links (US-6).

import { db } from '@/lib/db';
import { parseJsonArray } from '../types';
import { withLatency } from './instrument';
import { computeAccountHealth, personalizationStrength } from './health';
import {
  buildAffinity,
  buildCalibration,
  buildReasons,
  buildSuppressionLists,
  estMonthlySales,
  rankCandidates,
} from './ranking';
import type { Outcome } from '@prisma/client';
import type { PickDTO, PicksResponse, PicksMeta } from './types';

const SNAPSHOT_TTL_MS = 10 * 60 * 1000; // aggressive caching of top picks (§7)
const KEEP_SNAPSHOTS = 3;

function winFlagFor(o: Outcome, minRoiPct: number): boolean {
  return o.netProfit > 0 && o.roiPct >= minRoiPct / 2;
}

async function regenerate(): Promise<PicksResponse> {
  const t0 = Date.now();
  const settings = await db.settings.findUnique({ where: { id: 'singleton' } });
  if (!settings) throw new Error('Settings not initialized');

  // ---- candidate set: fresh leads, minus user-level exclusions (deal-store hot path) ----
  const excludedBrands = parseJsonArray(settings.excludedBrands);
  const excludedAsins = parseJsonArray(settings.excludedAsins);
  const candidates = await db.lead.findMany({
    where: {
      fresh: true,
      ...(settings.excludeAmazonRetail ? { amazonRetail: false } : {}),
      ...(excludedBrands.length > 0 ? { brand: { notIn: excludedBrands } } : {}),
      ...(excludedAsins.length > 0 ? { asin: { notIn: excludedAsins } } : {}),
    },
    orderBy: { score: 'desc' },
    take: 400,
  });

  // ---- learning inputs ----
  const outcomes = await db.outcome.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
  const winByLead = new Map<string, boolean>();
  for (const o of outcomes) {
    if (!winByLead.has(o.leadId)) winByLead.set(o.leadId, winFlagFor(o, settings.minRoi));
  }
  const outcomeLeadIds = Array.from(winByLead.keys());
  const outcomeLeads = outcomeLeadIds.length > 0
    ? await db.lead.findMany({ where: { id: { in: outcomeLeadIds } }, select: { id: true, score: true, category: true } })
    : [];
  const scoreByLead = new Map(outcomeLeads.map((l) => [l.id, l.score]));
  const categoryByLead = new Map(outcomeLeads.map((l) => [l.id, l.category]));

  const calibration = buildCalibration(outcomes, winByLead, scoreByLead);
  const purchaseOutcomeCount = outcomes.filter((o) => ['BOUGHT', 'MULTI_UNIT', 'PARTIAL', 'RETURNED'].includes(o.type)).length;
  const strength = personalizationStrength(purchaseOutcomeCount);
  const affinity = buildAffinity(outcomes, winByLead, categoryByLead, strength);

  const suppressions = await db.suppression.findMany();
  const suppressionLists = buildSuppressionLists(suppressions);
  const health = await computeAccountHealth();

  // ---- rank (latency-instrumented, budget p95 < 2s) ----
  const { result: rankOut, ms: rankMs } = await withLatency('RANK', () =>
    Promise.resolve(
      rankCandidates({
        leads: candidates,
        listings: new Map(),
        calibration,
        affinity,
        suppressions: suppressionLists,
        health,
        settings,
      })
    )
  );

  // ---- reasons for the returned slice (latency-instrumented, budget p95 < 5s) ----
  const LIMIT = 20;
  const top = rankOut.ranked.slice(0, LIMIT);
  const listingIds = Array.from(new Set(top.map((r) => r.lead.listingId)));
  const listings = listingIds.length > 0
    ? await db.amazonListing.findMany({
        where: { id: { in: listingIds } },
        select: { id: true, priceStability: true, keepa30Avg: true, rankTrend: true },
      })
    : [];
  const listingById = new Map(listings.map((l) => [l.id, l]));

  const { result: withReasons, ms: reasonMs } = await withLatency('REASON', () =>
    Promise.resolve(
      top.map(({ lead, aiScore, confidence }) => {
        const { reason, factors } = buildReasons(lead, confidence, {
          listing: listingById.get(lead.listingId),
          affinity,
          minRoi: settings.minRoi,
          priceAgeH: lead.priceAgeH,
        });
        return { lead, aiScore, confidence, reason, factors };
      })
    )
  );

  const pipelineIds = new Set(
    (await db.pipelineItem.findMany({ select: { leadId: true } })).map((p) => p.leadId)
  );

  const picks: PickDTO[] = withReasons.map(({ lead, aiScore, confidence, reason, factors }, i) => ({
    leadId: lead.id,
    rank: i + 1,
    aiScore,
    baseScore: lead.score,
    confidence,
    reason,
    factors,
    personalization: (factors.some((f) => f.key === 'personalization') ? strength : strength === 'NONE' ? 'NONE' : 'WEAK') as PickDTO['personalization'],
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
    inPipeline: pipelineIds.has(lead.id),
    estMonthlySales: estMonthlySales(lead.bsr),
  }));

  // ---- snapshot for instant cold start (§7) ----
  const generatedAt = new Date();
  await db.pickSnapshot.create({
    data: { kind: 'top', payloadJson: JSON.stringify({ picks, generatedAt: generatedAt.toISOString() }) },
  });
  const oldSnapshots = await db.pickSnapshot.findMany({
    orderBy: { generatedAt: 'desc' },
    select: { id: true },
    skip: KEEP_SNAPSHOTS,
  });
  if (oldSnapshots.length > 0) await db.pickSnapshot.deleteMany({ where: { id: { in: oldSnapshots.map((s) => s.id) } } });

  // ---- actionable notifications with deep links (US-6) ----
  const notified = await db.notification.findMany({
    where: { kind: 'NEW_PICK', leadId: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { leadId: true },
  });
  const notifiedSet = new Set(notified.map((n) => n.leadId));
  let created = 0;
  for (const p of picks) {
    if (created >= 5) break;
    if (p.confidence.band !== 'HIGH' || p.aiScore < 70 || notifiedSet.has(p.leadId)) continue;
    await db.notification.create({
      data: {
        kind: 'NEW_PICK',
        title: `Top pick: ${money(p.lead.netProfit)} profit · ${Math.round(p.lead.roiPct)}% ROI`,
        body: p.reason,
        leadId: p.leadId,
        deepLink: `/?deal=${p.leadId}`,
        channel: 'push',
      },
    });
    created += 1;
  }

  const meta: PicksMeta = {
    generatedAt: generatedAt.toISOString(),
    cached: false,
    stale: false,
    coldStart: !settings.onboarded,
    safeMode: !settings.onboarded || health.forcedSafeMode,
    personalization: strength,
    outcomeCount: purchaseOutcomeCount,
    health,
    rankMs: Math.round(rankMs * 10) / 10,
    reasonMs: Math.round(reasonMs * 10) / 10,
    excludedStale: rankOut.excludedStale,
    excludedSuppressed: rankOut.excludedSuppressed,
    ...(Date.now() - t0 > 60_000 ? {} : {}),
  };
  return { picks, meta };
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export async function getPicks(opts: { refresh?: boolean } = {}): Promise<PicksResponse> {
  if (!opts.refresh) {
    const snap = await db.pickSnapshot.findFirst({ orderBy: { generatedAt: 'desc' } });
    if (snap && Date.now() - snap.generatedAt.getTime() < SNAPSHOT_TTL_MS) {
      try {
        const payload = JSON.parse(snap.payloadJson) as { picks: PickDTO[]; generatedAt: string };
        const settings = await db.settings.findUnique({ where: { id: 'singleton' } });
        const health = await computeAccountHealth();
        const purchaseOutcomeCount = await db.outcome.count({
          where: { type: { in: ['BOUGHT', 'MULTI_UNIT', 'PARTIAL', 'RETURNED'] } },
        });
        const meta: PicksMeta = {
          generatedAt: payload.generatedAt,
          cached: true,
          stale: false,
          coldStart: !settings?.onboarded,
          safeMode: !settings?.onboarded || health.forcedSafeMode,
          personalization: personalizationStrength(purchaseOutcomeCount),
          outcomeCount: purchaseOutcomeCount,
          health,
          rankMs: 0,
          reasonMs: 0,
          excludedStale: 0,
          excludedSuppressed: 0,
        };
        return { picks: payload.picks, meta };
      } catch {
        // corrupt snapshot → regenerate below
      }
    }
  }

  try {
    return await regenerate();
  } catch (err) {
    console.error('[picks] regenerate failed — serving last known good snapshot:', err);
    // Deterministic fallback (§7): serve the last known good ranked list, clearly stale.
    const snap = await db.pickSnapshot.findFirst({ orderBy: { generatedAt: 'desc' } });
    if (snap) {
      const payload = JSON.parse(snap.payloadJson) as { picks: PickDTO[]; generatedAt: string };
      return {
        picks: payload.picks,
        meta: {
          generatedAt: payload.generatedAt,
          cached: true,
          stale: true,
          coldStart: false,
          safeMode: false,
          personalization: 'NONE',
          outcomeCount: 0,
          health: {
            score: 100,
            label: 'HEALTHY',
            reasons: ['Served from last known good snapshot — live ranking unavailable.'],
            suggestions: [],
            enforceFlags: [],
            forcedSafeMode: false,
            returnRate: 0,
            gatedBuys: 0,
            ipBuys: 0,
            sampleSize: 0,
          },
          rankMs: 0,
          reasonMs: 0,
          excludedStale: 0,
          excludedSuppressed: 0,
        },
      };
    }
    throw err;
  }
}
