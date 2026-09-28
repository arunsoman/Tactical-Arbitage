import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const DAY = 864e5;

/** Dashboard KPIs (PRD §4 success metrics) + chart series + activity feed. */
export async function GET() {
  const now = Date.now();
  const settings = (await db.settings.findUnique({ where: { id: 'singleton' } }))!;

  const [
    leadsToday,
    leads7d,
    pipelineActions7d,
    totalLeads,
    freshLeads,
    reviewQueue,
    flaggedMatches,
    autoAccepted,
    retailers,
    recentJobs,
    activity,
    topOpportunities,
  ] = await Promise.all([
    db.lead.count({ where: { firstSeenAt: { gte: new Date(now - DAY) } } }),
    db.lead.count({ where: { firstSeenAt: { gte: new Date(now - 7 * DAY) } } }),
    db.pipelineItem.count({ where: { updatedAt: { gte: new Date(now - 7 * DAY) } } }),
    db.lead.count(),
    db.lead.count({ where: { fresh: true } }),
    db.match.count({ where: { status: 'REVIEW', flagged: false } }),
    db.match.count({ where: { flagged: true } }),
    db.match.count({ where: { status: 'AUTO_ACCEPTED' } }),
    db.retailer.findMany({ orderBy: [{ tier: 'asc' }, { name: 'asc' }] }),
    db.scanJob.findMany({
      orderBy: { startedAt: 'desc' },
      take: 8,
      include: { retailer: { select: { name: true, tier: true } } },
    }),
    db.activityEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 9 }),
    db.lead.findMany({ orderBy: { score: 'desc' }, take: 8 }),
  ]);

  // leads/day for 14 days
  const leads14 = await db.lead.findMany({
    where: { firstSeenAt: { gte: new Date(now - 14 * DAY) } },
    select: { firstSeenAt: true, roiPct: true },
  });
  const perDay = new Map<string, number>();
  const roiBuckets = { '0-20': 0, '20-40': 0, '40-60': 0, '60-100': 0, '100+': 0 };
  const allLeads = await db.lead.findMany({ select: { roiPct: true, category: true, netProfit: true } });

  for (let d = 13; d >= 0; d--) {
    const day = new Date(now - d * DAY);
    const key = `${String(day.getMonth() + 1).padStart(2, '0')}/${String(day.getDate()).padStart(2, '0')}`;
    perDay.set(key, 0);
  }
  for (const l of leads14) {
    const day = l.firstSeenAt;
    const key = `${String(day.getMonth() + 1).padStart(2, '0')}/${String(day.getDate()).padStart(2, '0')}`;
    if (perDay.has(key)) perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  for (const l of allLeads) {
    if (l.roiPct < 20) roiBuckets['0-20']++;
    else if (l.roiPct < 40) roiBuckets['20-40']++;
    else if (l.roiPct < 60) roiBuckets['40-60']++;
    else if (l.roiPct < 100) roiBuckets['60-100']++;
    else roiBuckets['100+']++;
  }

  // category breakdown
  const catMap = new Map<string, { count: number; roiSum: number; profitSum: number }>();
  for (const l of allLeads) {
    const c = catMap.get(l.category) ?? { count: 0, roiSum: 0, profitSum: 0 };
    c.count++;
    c.roiSum += l.roiPct;
    c.profitSum += l.netProfit;
    catMap.set(l.category, c);
  }
  const categories = [...catMap.entries()]
    .map(([category, v]) => ({ category, count: v.count, avgRoi: Math.round((v.roiSum / v.count) * 10) / 10, totalProfit: Math.round(v.profitSum) }))
    .sort((a, b) => b.count - a.count);

  const avgCoverage = retailers.length ? retailers.reduce((s, r) => s + r.coverage, 0) / retailers.length : 0;
  const healthySites = retailers.filter((r) => r.status === 'healthy').length;
  // match precision proxy: clean auto-accepts over all auto-accepts (PRD target ≥95%)
  const matchPrecision = autoAccepted > 0 ? Math.round(((autoAccepted - flaggedMatches) / autoAccepted) * 1000) / 10 : 100;
  const priceFreshness = totalLeads > 0 ? Math.round((freshLeads / totalLeads) * 1000) / 10 : 0;
  const avgRoi = allLeads.length ? Math.round((allLeads.reduce((s, l) => s + l.roiPct, 0) / allLeads.length) * 10) / 10 : 0;

  return NextResponse.json({
    kpis: {
      northStar: { value: pipelineActions7d, target: 25, label: 'Leads acted on this week' },
      leadsToday,
      leads7d,
      totalLeads,
      avgRoi,
      matchPrecision,
      priceFreshness,
      scanCoverage: Math.round(avgCoverage * 10) / 10,
      reviewQueue,
      healthySites,
      totalSites: retailers.length,
    },
    leadsPerDay: [...perDay.entries()].map(([d, n]) => ({ d, n })),
    roiBuckets: Object.entries(roiBuckets).map(([bucket, n]) => ({ bucket, n })),
    categories,
    recentJobs: recentJobs.map((j) => ({
      id: j.id,
      retailer: j.retailer.name,
      tier: j.retailer.tier,
      status: j.status,
      skus: j.skusProcessed,
      newLeads: j.newLeads,
      errors: j.errors,
      startedAt: j.startedAt,
    })),
    activity,
    topOpportunities: topOpportunities.map((l) => ({
      id: l.id,
      title: l.title,
      retailerName: l.retailerName,
      asin: l.asin,
      category: l.category,
      retailerPrice: l.retailerPrice,
      buyBox: l.buyBox,
      netProfit: l.netProfit,
      roiPct: l.roiPct,
      score: l.score,
      riskFlags: l.riskFlags,
      imageUrl: l.imageUrl,
    })),
    plan: settings.plan,
  });
}
