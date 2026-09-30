// Supplier connector registry (PRD §6 Module B): CRUD with lifecycle edits.
// Retailer linkage only mutates scan-network state via the promote route.

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { evaluateGates, LIFECYCLE } from '@/lib/ta/ops';

export const dynamic = 'force-dynamic';

const ADAPTERS = ['CRAWLER', 'API', 'RSS', 'MANUAL_UPLOAD'];
const AUTHS = ['NONE', 'API_KEY', 'OAUTH', 'COOKIES'];

function maskAuth(authType: string, secret: string | undefined): string | null {
  if (authType === 'NONE' || !secret) return null;
  return `***${secret.replace(/\s+/g, '').slice(-2)}`;
}

export async function GET() {
  const [connectors, runs, retailers] = await Promise.all([
    db.connector.findMany({ include: { retailer: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }),
    db.connectorTestRun.findMany({ orderBy: { createdAt: 'desc' }, take: 300 }),
    db.retailer.findMany({ select: { id: true, name: true, domain: true, tier: true, status: true }, orderBy: { name: 'asc' } }),
  ]);
  const rows = connectors.map((c) => {
    const myRuns = runs.filter((r) => r.connectorId === c.id);
    const nextStates = ['TESTING', 'CANARY', 'LIVE', 'PAUSED', 'RETIRED'].filter((to) => {
      if (to === c.status) return false;
      try { return evaluateGates(c, myRuns, to).ok; } catch { return false; }
    });
    return {
      id: c.id, name: c.name, adapterType: c.adapterType, endpoint: c.endpoint,
      authType: c.authType, authMasked: c.authMasked, rateLimitRpm: c.rateLimitRpm,
      cadenceHours: c.cadenceHours, tier: c.tier, status: c.status, schemaOk: c.schemaOk,
      healthScore: c.healthScore, notes: c.notes, retailerId: c.retailerId,
      retailerName: c.retailer?.name ?? null, createdAt: c.createdAt,
      lastRuns: myRuns.slice(0, 5).map((r) => ({ kind: r.kind, ok: r.ok, score: r.score, createdAt: r.createdAt })),
    };
  });
  return NextResponse.json({ connectors: rows, retailers, lifecycle: LIFECYCLE });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
    const adapterType = ADAPTERS.includes(body.adapterType) ? body.adapterType : null;
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim().slice(0, 200) : '';
    if (!name || !adapterType || !endpoint) {
      return NextResponse.json({ error: 'name, adapterType (CRAWLER/API/RSS/MANUAL_UPLOAD) and endpoint are required' }, { status: 400 });
    }
    const authType = AUTHS.includes(body.authType) ? body.authType : 'NONE';
    let retailerId: string | null = null;
    if (typeof body.retailerId === 'string' && body.retailerId) {
      const retailer = await db.retailer.findUnique({ where: { id: body.retailerId } });
      if (!retailer) return NextResponse.json({ error: 'retailer not found' }, { status: 404 });
      const linked = await db.connector.findFirst({ where: { retailerId: retailer.id, status: { in: ['DRAFT', 'TESTING', 'CANARY', 'LIVE', 'PAUSED'] } } });
      if (linked) return NextResponse.json({ error: `${retailer.name} already has an active connector (${linked.name})` }, { status: 409 });
      retailerId = retailer.id;
    }
    const connector = await db.connector.create({
      data: {
        name, adapterType, endpoint,
        authType, authMasked: maskAuth(authType, body.authSecret),
        rateLimitRpm: Number.isFinite(body.rateLimitRpm) ? Math.max(5, Math.min(600, Math.round(body.rateLimitRpm))) : 60,
        cadenceHours: Number.isFinite(body.cadenceHours) ? Math.max(1, Math.min(168, Math.round(body.cadenceHours))) : 24,
        tier: ['A', 'B', 'C'].includes(body.tier) ? body.tier : 'B',
        notes: typeof body.notes === 'string' ? body.notes.slice(0, 300) : null,
        retailerId,
        createdBy: 'Admin',
      },
    });
    await db.auditEvent.create({
      data: { actor: 'Admin', actorRole: 'SYSTEM', action: 'OPS_CONNECTOR_CREATE', targetType: 'connector', targetId: connector.name, detailJson: JSON.stringify({ adapterType, endpoint, retailerLinked: !!retailerId }) },
    });
    return NextResponse.json({ ok: true, connector });
  } catch (err) {
    console.error('connector create failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'create failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    const current = await db.connector.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: 'connector not found' }, { status: 404 });

    const data: Record<string, unknown> = {};
    // config edits are allowed in every state except LIVE/RETIRED (PRD §6.2)
    const editable = !['LIVE', 'RETIRED'].includes(current.status) || body.force === true;
    for (const key of ['name', 'endpoint', 'notes'] as const) {
      if (typeof body[key] === 'string') {
        if (!editable) return NextResponse.json({ error: `${current.name} is ${current.status} — pause it before editing config` }, { status: 422 });
        data[key] = body[key].slice(0, 300);
      }
    }
    if (ADAPTERS.includes(body.adapterType)) {
      if (!editable) return NextResponse.json({ error: `${current.name} is ${current.status} — pause it before editing config` }, { status: 422 });
      data.adapterType = body.adapterType;
    }
    if (Number.isFinite(body.rateLimitRpm)) data.rateLimitRpm = Math.max(5, Math.min(600, Math.round(body.rateLimitRpm)));
    if (Number.isFinite(body.cadenceHours)) data.cadenceHours = Math.max(1, Math.min(168, Math.round(body.cadenceHours)));
    if (typeof body.status === 'string' && ['PAUSED', 'RETIRED'].includes(body.status)) {
      // pause/retire: reverse the Retailer linkage side effects
      data.status = body.status;
      if (current.retailerId) {
        await db.retailer.update({
          where: { id: current.retailerId },
          data: { status: body.status === 'PAUSED' ? 'degraded' : 'blocked' },
        });
      }
    }
    const connector = await db.connector.update({ where: { id }, data });
    await db.auditEvent.create({
      data: { actor: 'Admin', actorRole: 'SYSTEM', action: body.status === 'PAUSED' ? 'OPS_CONNECTOR_PAUSE' : body.status === 'RETIRED' ? 'OPS_CONNECTOR_RETIRED' : 'OPS_CONNECTOR_EDIT', targetType: 'connector', targetId: connector.name, detailJson: JSON.stringify(data) },
    });
    return NextResponse.json({ ok: true, connector });
  } catch (err) {
    console.error('connector patch failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'patch failed' }, { status: 500 });
  }
}
