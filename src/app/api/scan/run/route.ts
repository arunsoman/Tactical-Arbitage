import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { runScan } from '@/lib/ta/scan';
import { PLANS } from '@/lib/ta/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Scan-slot fairness (FR-9.2): concurrent jobs capped per plan tier. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const settings = (await db.settings.findUnique({ where: { id: 'singleton' } }))!;
  const plan = PLANS[settings.plan as keyof typeof PLANS] ?? PLANS.PRO;

  const running = await db.scanJob.count({ where: { status: 'RUNNING' } });
  if (running >= plan.concurrentScanSlots) {
    return NextResponse.json(
      {
        error: `All ${plan.concurrentScanSlots} scan slots on ${plan.name} are busy. Queue position ${running - plan.concurrentScanSlots + 1}.`,
        code: 'QUEUE',
        queuePosition: running - plan.concurrentScanSlots + 1,
      },
      { status: 429 }
    );
  }

  try {
    const summary = await runScan({
      scanSetId: typeof body.scanSetId === 'string' ? body.scanSetId : undefined,
      retailerIds: Array.isArray(body.retailerIds) ? body.retailerIds.filter((x: unknown) => typeof x === 'string') : undefined,
      retailerLimit: typeof body.retailerLimit === 'number' ? body.retailerLimit : undefined,
    });
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    console.error('scan run failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'scan failed' }, { status: 500 });
  }
}
