import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tierSlaHours } from '@/lib/ta/leadEngine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const retailers = await db.retailer.findMany({ orderBy: [{ tier: 'asc' }, { name: 'asc' }] });
  const jobs = await db.scanJob.findMany({
    orderBy: { startedAt: 'desc' },
    take: 12,
    include: { retailer: { select: { name: true } } },
  });
  const enriched = retailers.map((r) => ({
    ...r,
    slaHours: tierSlaHours(r.tier),
    productCount: 0, // filled below
  }));
  const counts = await db.retailerProduct.groupBy({ by: ['retailerId'], _count: { _all: true } });
  const countMap = new Map(counts.map((c) => [c.retailerId, c._count._all]));
  return NextResponse.json({
    retailers: enriched.map((r) => ({ ...r, productCount: countMap.get(r.id) ?? 0 })),
    recentJobs: jobs.map((j) => ({
      id: j.id,
      retailer: j.retailer.name,
      status: j.status,
      pages: j.pagesCrawled,
      skus: j.skusProcessed,
      newLeads: j.newLeads,
      priceUpdates: j.priceUpdates,
      errors: j.errors,
      startedAt: j.startedAt,
    })),
  });
}
