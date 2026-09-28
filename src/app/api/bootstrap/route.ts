import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { PLANS } from '@/lib/ta/types';

export const dynamic = 'force-dynamic';

/** One-shot app bootstrap: settings + retailer list + categories + headline counts. */
export async function GET() {
  let settings = await db.settings.findUnique({ where: { id: 'singleton' } });
  if (!settings) {
    settings = await db.settings.create({ data: { id: 'singleton' } });
  }

  const [retailers, categories, totalLeads, freshLeads, reviewQueue, pipelineCount, scansets] = await Promise.all([
    db.retailer.findMany({
      select: { id: true, name: true, domain: true, tier: true, status: true, cadenceHours: true, coverage: true },
      orderBy: [{ tier: 'asc' }, { name: 'asc' }],
    }),
    db.amazonListing.findMany({ select: { category: true }, distinct: ['category'], orderBy: { category: 'asc' } }),
    db.lead.count(),
    db.lead.count({ where: { fresh: true } }),
    db.match.count({ where: { status: 'REVIEW', flagged: false } }),
    db.pipelineItem.count(),
    db.scanSet.count(),
  ]);

  return NextResponse.json({
    settings,
    plan: PLANS[settings.plan as keyof typeof PLANS] ?? PLANS.PRO,
    retailers,
    categories: categories.map((c) => c.category),
    counts: { totalLeads, freshLeads, reviewQueue, pipelineCount, scansets },
  });
}
