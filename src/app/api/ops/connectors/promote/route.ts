// Connector lifecycle promotion (PRD §6.2/6.4): server-side gate engine.
// The console only surfaces gate state — every transition is validated here
// against recorded test evidence, and both success and rejection are audited.

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { evaluateGates } from '@/lib/ta/ops';

export const dynamic = 'force-dynamic';

// Gate preview (PRD §9.2): the promotion dialog lists every gate with live
// pass/fail BEFORE the admin confirms — no client-side trust involved.
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const connectorId = params.get('connectorId') ?? '';
  const to = params.get('to') ?? '';
  if (!connectorId || !['TESTING', 'CANARY', 'LIVE', 'PAUSED', 'RETIRED'].includes(to)) {
    return NextResponse.json({ error: 'connectorId and a valid target state are required' }, { status: 400 });
  }
  const connector = await db.connector.findUnique({ where: { id: connectorId } });
  if (!connector) return NextResponse.json({ error: 'connector not found' }, { status: 404 });
  const runs = await db.connectorTestRun.findMany({ where: { connectorId }, orderBy: { createdAt: 'desc' }, take: 60 });
  const evaluation = evaluateGates(connector, runs, to);
  return NextResponse.json({ to, ok: evaluation.ok, gates: evaluation.gates });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const connectorId = typeof body.connectorId === 'string' ? body.connectorId : '';
    const to = typeof body.to === 'string' ? body.to : '';
    if (!connectorId || !['TESTING', 'CANARY', 'LIVE', 'PAUSED', 'RETIRED'].includes(to)) {
      return NextResponse.json({ error: 'connectorId and a valid target state are required' }, { status: 400 });
    }
    const connector = await db.connector.findUnique({ where: { id: connectorId } });
    if (!connector) return NextResponse.json({ error: 'connector not found' }, { status: 404 });

    const runs = await db.connectorTestRun.findMany({ where: { connectorId }, orderBy: { createdAt: 'desc' }, take: 60 });
    const evaluation = evaluateGates(connector, runs, to);

    if (!evaluation.ok) {
      await db.auditEvent.create({
        data: { actor: 'Admin', actorRole: 'SYSTEM', action: 'OPS_PROMOTE_BLOCKED', targetType: 'connector', targetId: connector.name, detailJson: JSON.stringify({ to, unmet: evaluation.gates.filter((g) => !g.pass).map((g) => g.id) }) },
      });
      return NextResponse.json(
        { error: `Promotion to ${to} blocked — unmet gates`, gates: evaluation.gates },
        { status: 422 },
      );
    }

    // execute transition + side effects
    const updated = await db.connector.update({ where: { id: connector.id }, data: { status: to } });
    if (to === 'LIVE' && connector.retailerId) {
      await db.retailer.update({
        where: { id: connector.retailerId },
        data: {
          status: 'healthy',
          cadenceHours: updated.cadenceHours,
          notes: `Connector "${updated.name}" live (adapter ${updated.adapterType}, ${updated.rateLimitRpm} rpm).`,
        },
      });
    }
    if (to === 'PAUSED' && connector.retailerId) {
      await db.retailer.update({ where: { id: connector.retailerId }, data: { status: 'degraded' } });
    }
    if (to === 'RETIRED' && connector.retailerId) {
      await db.retailer.update({ where: { id: connector.retailerId }, data: { status: 'blocked' } });
    }
    await db.auditEvent.create({
      data: { actor: 'Admin', actorRole: 'SYSTEM', action: to === 'LIVE' ? 'OPS_CONNECTOR_LIVE' : `OPS_CONNECTOR_${to}`, targetType: 'connector', targetId: connector.name, detailJson: JSON.stringify({ from: connector.status, to }) },
    });

    return NextResponse.json({
      ok: true,
      connector: updated,
      message: `${connector.name}: ${connector.status} → ${to}${to === 'LIVE' && connector.retailerId ? ' — retailer is live in the next scan cycle' : ''}`,
    });
  } catch (err) {
    console.error('connector promote failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'promotion failed' }, { status: 500 });
  }
}
