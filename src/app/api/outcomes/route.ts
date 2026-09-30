// Outcome capture (§5 Outcome Capture, §4 US-7): bought / returned / partial /
// multi-unit / cancelled, mobile quick-entry semantics, prompt + impute with a
// confidence flag, and the learning loop hook — every outcome feeds calibration,
// personalization and account health on the next ranking pass.

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { round2 } from '@/lib/ta/profit';

export const dynamic = 'force-dynamic';

const TYPES = ['BOUGHT', 'RETURNED', 'PARTIAL', 'MULTI_UNIT', 'CANCELLED'];

/** GET ?pending=1 → purchases missing outcomes (the daily "log outcome" prompt list). */
export async function GET(req: NextRequest) {
  const pending = req.nextUrl.searchParams.get('pending') === '1';
  const leadId = req.nextUrl.searchParams.get('leadId');

  if (leadId) {
    const outcomes = await db.outcome.findMany({ where: { leadId }, orderBy: { createdAt: 'desc' }, take: 20 });
    return NextResponse.json({ outcomes });
  }

  if (pending) {
    const items = await db.pipelineItem.findMany({
      where: { status: { in: ['PURCHASED', 'SHIPPED', 'LIVE'] } },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      include: {
        lead: {
          select: {
            id: true, asin: true, title: true, brand: true, category: true, imageUrl: true,
            retailerName: true, retailerPrice: true, buyBox: true, totalCost: true, netProfit: true, roiPct: true,
          },
        },
      },
    });
    const withOutcomes = await db.outcome.findMany({
      where: { leadId: { in: items.map((i) => i.leadId) } },
      select: { leadId: true },
    });
    const hasOutcome = new Set(withOutcomes.map((o) => o.leadId));
    const pendingItems = items.filter((i) => !hasOutcome.has(i.leadId));
    return NextResponse.json({ pending: pendingItems });
  }

  const outcomes = await db.outcome.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  return NextResponse.json({ outcomes });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const leadId = typeof body.leadId === 'string' ? body.leadId : '';
    const type = TYPES.includes(body.type) ? body.type : null;
    if (!leadId || !type) {
      return NextResponse.json({ error: 'leadId and a valid outcome type are required' }, { status: 400 });
    }

    const lead = await db.lead.findUnique({ where: { id: leadId } });
    if (!lead) return NextResponse.json({ error: 'lead not found' }, { status: 404 });
    const settings = await db.settings.findUnique({ where: { id: 'singleton' } });
    const minRoi = settings?.minRoi ?? 30;

    const units = Math.max(1, Math.min(999, parseInt(body.units, 10) || 1));
    const unitsSold = Math.max(0, Math.min(units, parseInt(body.unitsSold, 10) || (type === 'RETURNED' || type === 'CANCELLED' ? 0 : units)));
    const unitsReturned = Math.max(0, Math.min(units, parseInt(body.unitsReturned, 10) || (type === 'RETURNED' ? units : 0)));

    // Smart defaults (§10: forms minimize typing): revenue ≈ unitsSold × buy box,
    // cost ≈ units × fully landed cost. The client prefills these; server recomputes.
    const revenue = Number.isFinite(Number(body.revenue)) ? round2(Number(body.revenue)) : round2(unitsSold * lead.buyBox);
    const cost = Number.isFinite(Number(body.cost)) ? round2(Number(body.cost)) : round2(units * lead.totalCost);
    const netProfit = type === 'CANCELLED' ? 0 : round2(revenue - cost);
    const roiPct = cost > 0 && type !== 'CANCELLED' ? round2((netProfit / cost) * 100) : 0;
    const win = netProfit > 0 && roiPct >= minRoi / 2;
    const imputed = Boolean(body.imputed);
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim().slice(0, 60) : 'Sofia';
    const actorRole = ['OWNER', 'MANAGER', 'VA'].includes(body.actorRole) ? body.actorRole : 'OWNER';

    const outcome = await db.outcome.create({
      data: {
        leadId, type, units, unitsSold, unitsReturned,
        revenue: type === 'CANCELLED' ? 0 : revenue,
        cost: type === 'CANCELLED' ? 0 : cost,
        netProfit, roiPct, win, imputed,
        note: typeof body.note === 'string' ? body.note.slice(0, 300) : null,
        actor, actorRole,
      },
    });

    // Pipeline sync (FR-7.1 state machine driven by realized outcomes).
    const item = await db.pipelineItem.findUnique({ where: { leadId } });
    if (item) {
      let nextStatus = item.status;
      if (type === 'BOUGHT' || type === 'MULTI_UNIT') {
        nextStatus = ['NEW', 'INTERESTED'].includes(item.status) ? 'PURCHASED' : item.status === 'PURCHASED' && revenue > 0 ? 'WON' : item.status;
        if (item.status === 'PURCHASED' && revenue > 0) nextStatus = win ? 'WON' : 'LOST';
      } else if (type === 'PARTIAL') {
        nextStatus = revenue > 0 ? (win ? 'WON' : 'LOST') : item.status;
      } else if (type === 'RETURNED' || type === 'CANCELLED') {
        nextStatus = 'LOST';
      }
      if (nextStatus !== item.status) {
        await db.pipelineItem.update({ where: { id: item.id }, data: { status: nextStatus } });
      }
    }

    await db.auditEvent.create({
      data: {
        actor, actorRole, action: 'OUTCOME',
        targetType: 'lead', targetId: leadId,
        detailJson: JSON.stringify({ type, units, revenue, cost, netProfit, roiPct, win, imputed }),
      },
    });
    await db.activityEvent.create({
      data: { type: 'PIPELINE', message: `Outcome logged: ${type.toLowerCase()} — ${lead.asin} (${netProfit >= 0 ? '+' : ''}$${netProfit.toFixed(2)} realized)`, metaJson: JSON.stringify({ leadId }) },
    });

    return NextResponse.json({ ok: true, outcome, win });
  } catch (err) {
    console.error('outcome failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'outcome failed' }, { status: 500 });
  }
}
