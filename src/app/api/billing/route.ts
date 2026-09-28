import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { PLANS } from '@/lib/ta/types';

export const dynamic = 'force-dynamic';

/** Plan + scan-slot usage (FR-9.1/9.2). */
export async function GET() {
  const settings = (await db.settings.findUnique({ where: { id: 'singleton' } }))!;
  const plan = PLANS[settings.plan as keyof typeof PLANS] ?? PLANS.PRO;
  const [scans, subAccountSlots] = await Promise.all([db.scanSet.count(), db.pipelineItem.groupBy({ by: ['owner'], _count: { _all: true } })]);
  const owners = subAccountSlots.map((s) => s.owner);
  return NextResponse.json({
    plan,
    trialEndsAt: settings.trialEndsAt,
    marketplace: settings.marketplace,
    usage: {
      savedScans: scans,
      savedScansLimit: plan.savedScans,
      marketplacesUsed: 1,
      marketplacesLimit: plan.marketplaces,
      subAccounts: owners.filter((o) => o !== 'Main').length,
      subAccountsLimit: plan.subAccounts,
      scanSlots: plan.concurrentScanSlots,
    },
    owners,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const plan = typeof body.plan === 'string' && ['STARTER', 'PRO', 'EXPERT'].includes(body.plan) ? body.plan : null;
  const cycle = body.cycle === 'annual' ? 'annual' : 'monthly';
  if (!plan) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });

  await db.settings.update({ where: { id: 'singleton' }, data: { plan } });
  await db.activityEvent.create({
    data: {
      type: 'SYSTEM',
      message: `Plan changed to ${PLANS[plan as keyof typeof PLANS].name} (${cycle}). ${cycle === 'annual' ? '2 months free applied.' : ''}`,
    },
  });
  return NextResponse.json({ ok: true });
}
