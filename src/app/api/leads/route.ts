import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { buildLeadWhere, parseLeadQuery, postFilterRiskFlags, SORTS } from '@/lib/ta/filters';

export const dynamic = 'force-dynamic';

/** Deal-store hot path: filtered, sorted, paginated leads (p95 < 1.5s target). */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = parseLeadQuery(searchParams);
  const settings = (await db.settings.findUnique({ where: { id: 'singleton' } }))!;

  const where = buildLeadWhere(q.filters, settings);
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
        pipeline: { select: { id: true, status: true } },
      },
    }),
    db.lead.count({ where }),
  ]);

  const rows = postFilterRiskFlags(rowsRaw, q.filters.excludeFlags).slice(0, q.pageSize);
  return NextResponse.json({
    rows,
    total,
    page: q.page,
    pageSize: q.pageSize,
    hasMore: q.page * q.pageSize < total,
  });
}
