import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { loadScanIndex, scansForLead } from '@/lib/ta/scanAttribution';
import { buildLeadWhere, parseLeadQuery, postFilterRiskFlags, SORTS } from '@/lib/ta/filters';

export const dynamic = 'force-dynamic';

/** Deal-store hot path: filtered, sorted, paginated leads (p95 < 1.5s target). */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = parseLeadQuery(searchParams);
  const settings = (await db.settings.findUnique({ where: { id: 'singleton' } }))!;

  const baseWhere = buildLeadWhere(q.filters, settings);
  // "new only" mode (scan results): restrict to leads first seen at/after this instant
  const sinceRaw = searchParams.get('since');
  const since = sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? new Date(sinceRaw) : null;
  const where = since ? { AND: [baseWhere, { firstSeenAt: { gte: since } }] } : baseWhere;
  const orderBy = SORTS[q.sort] ?? SORTS.score;

  const [rowsRaw, total] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize * 3, // over-fetch to survive risk-flag post-filter
      select: {
        id: true,
        asin: true,
        title: true,
        brand: true,
        category: true,
        imageUrl: true,
        retailerId: true,
        retailerName: true,
        retailerTier: true,
        retailerPrice: true,
        listPrice: true,
        couponPct: true,
        buyBox: true,
        netProfit: true,
        roiPct: true,
        marginPct: true,
        breakeven: true,
        discountPct: true,
        bsr: true,
        fbaOffers: true,
        fbmOffers: true,
        sizeTier: true,
        riskFlags: true,
        score: true,
        priceAgeH: true,
        fresh: true,
        firstSeenAt: true,
        amazonRetail: true,
        foundByScanId: true,
        pipeline: { select: { id: true, status: true } },
      },
    }),
    // risk-flag exclusions are applied in memory, so count the same way to keep totals honest
    q.filters.excludeFlags.length > 0
      ? db.lead.findMany({ where, select: { riskFlags: true } }).then((r) => postFilterRiskFlags(r, q.filters.excludeFlags).length)
      : db.lead.count({ where }),
  ]);

  const index = await loadScanIndex();
  const rows = postFilterRiskFlags(rowsRaw, q.filters.excludeFlags)
    .slice(0, q.pageSize)
    .map((r) => ({ ...r, scans: scansForLead(r, index, settings) }));
  return NextResponse.json({
    rows,
    total,
    page: q.page,
    pageSize: q.pageSize,
    hasMore: q.page * q.pageSize < total,
  });
}
