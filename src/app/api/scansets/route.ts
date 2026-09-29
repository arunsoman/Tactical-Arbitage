import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { sanitizeFilters } from '@/lib/ta/types';
import { PLANS } from '@/lib/ta/types';
import { buildLeadWhere, postFilterRiskFlags } from '@/lib/ta/filters';

export const dynamic = 'force-dynamic';

/** Saved scans list with per-scan lead counters (FR-4.3). */
export async function GET() {
  const settings = (await db.settings.findUnique({ where: { id: 'singleton' } }))!;
  const plan = PLANS[settings.plan as keyof typeof PLANS] ?? PLANS.PRO;

  const scans = await db.scanSet.findMany({ orderBy: { createdAt: 'asc' } });
  const withCounts = await Promise.all(
    scans.map(async (s) => {
      const filters = sanitizeFilters(JSON.parse(s.filtersJson || '{}'));
      const since = s.lastRunStartedAt ?? s.lastRunAt ?? new Date(Date.now() - 7 * 864e5);
      // same query Deal Finder runs, so "total in feed" always matches "View results"
      const where = buildLeadWhere(filters, settings);
      const [totalRows, newRows] = await Promise.all([
        db.lead.findMany({ where, select: { riskFlags: true } }),
        db.lead.findMany({ where: { AND: [where, { firstSeenAt: { gte: since } }] }, select: { riskFlags: true } }),
      ]);
      const total = postFilterRiskFlags(totalRows, filters.excludeFlags).length;
      const newSinceRun = postFilterRiskFlags(newRows, filters.excludeFlags).length;
      return {
        ...s,
        filters,
        newSinceRun,
        total,
        activeJobs: await db.scanJob.count({ where: { scanSetId: s.id, status: 'RUNNING' } }),
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
