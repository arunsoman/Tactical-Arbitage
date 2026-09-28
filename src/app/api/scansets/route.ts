import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { sanitizeFilters } from '@/lib/ta/types';
import { PLANS } from '@/lib/ta/types';

export const dynamic = 'force-dynamic';

/** Saved scans list with per-scan lead counters (FR-4.3). */
export async function GET() {
  const settings = (await db.settings.findUnique({ where: { id: 'singleton' } }))!;
  const plan = PLANS[settings.plan as keyof typeof PLANS] ?? PLANS.PRO;

  const scans = await db.scanSet.findMany({ orderBy: { createdAt: 'asc' } });
  const withCounts = await Promise.all(
    scans.map(async (s) => {
      const filters = sanitizeFilters(JSON.parse(s.filtersJson || '{}'));
      const since = s.lastRunAt ?? new Date(Date.now() - 7 * 864e5);
      const sinceFilter: Record<string, unknown> = { firstSeenAt: { gte: since } };
      if (filters.categories.length > 0) sinceFilter.category = { in: filters.categories };
      if (filters.minRoi != null) sinceFilter.roiPct = { gte: filters.minRoi };
      if (filters.minProfit != null) sinceFilter.netProfit = { gte: filters.minProfit };
      const newSinceRun = await db.lead.count({ where: sinceFilter });
      const totalFilter: Record<string, unknown> = {};
      if (filters.categories.length > 0) totalFilter.category = { in: filters.categories };
      if (filters.minRoi != null) totalFilter.roiPct = { gte: filters.minRoi };
      const total = await db.lead.count({ where: totalFilter });
      return {
        ...s,
        filters,
        newSinceRun,
        total,
        activeJobs: 0,
      };
    })
  );

  return NextResponse.json({ scans: withCounts, planLimit: plan.savedScans, plan });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 60) : null;
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const settings = (await db.settings.findUnique({ where: { id: 'singleton' } }))!;
  const plan = PLANS[settings.plan as keyof typeof PLANS] ?? PLANS.PRO;
  const count = await db.scanSet.count();
  if (plan.savedScans != null && count >= plan.savedScans) {
    return NextResponse.json(
      { error: `Your ${plan.name} plan allows ${plan.savedScans} saved scans. Upgrade to add more.`, code: 'PLAN_LIMIT' },
      { status: 402 }
    );
  }

  const schedule = ['every_2h', 'every_12h', 'daily', 'weekly', 'manual'].includes(body.schedule) ? body.schedule : 'daily';
  const scan = await db.scanSet.create({
    data: { name, schedule, filtersJson: JSON.stringify(sanitizeFilters(body.filters)), active: body.active !== false },
  });
  return NextResponse.json({ ok: true, scan });
}
