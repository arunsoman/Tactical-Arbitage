// Trust layer (§1 human control first, §5 Trust/Override): permanent suppression
// with the full taxonomy (brand, category, retailer, ASIN, IP, return, gating),
// disputes, and immutable audit events for every action. VA-initiated suppressions
// route through the approval workflow instead of executing directly.

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const SCOPES = ['BRAND', 'CATEGORY', 'RETAILER', 'ASIN', 'IP', 'RETURN', 'GATING'];

export async function GET() {
  const [suppressions, disputes] = await Promise.all([
    db.suppression.findMany({ orderBy: { createdAt: 'desc' } }),
    db.dispute.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  return NextResponse.json({ suppressions, disputes });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim().slice(0, 60) : 'Sofia';
    const actorRole = ['OWNER', 'MANAGER', 'VA'].includes(body.actorRole) ? body.actorRole : 'OWNER';

    if (action === 'suppress') {
      const scope = SCOPES.includes(body.scope) ? body.scope : null;
      const value = typeof body.value === 'string' ? body.value.trim().slice(0, 80) : '';
      const reason = typeof body.reason === 'string' ? body.reason.slice(0, 300) : null;
      if (!scope || !value) return NextResponse.json({ error: 'scope and value are required' }, { status: 400 });

      // VA actions need Manager/Owner approval first (§5 VA / Team).
      if (actorRole === 'VA') {
        const approval = await db.approvalRequest.create({
          data: {
            kind: 'SUPPRESS',
            payloadJson: JSON.stringify({ scope, value, reason, actor }),
            requestedBy: actor,
          },
        });
        await db.notification.create({
          data: {
            kind: 'APPROVAL',
            title: 'Approval needed: suppress pattern',
            body: `${actor} requested a permanent ${scope.toLowerCase()} suppression of "${value}".`,
            deepLink: '/?view=team',
            channel: 'push',
          },
        });
        await db.auditEvent.create({
          data: { actor, actorRole, action: 'SUPPRESS', targetType: 'approval', targetId: approval.id, detailJson: JSON.stringify({ requested: true, scope, value }) },
        });
        return NextResponse.json({ ok: true, pendingApproval: true, approval });
      }

      const suppression = await db.suppression.upsert({
        where: { scope_value: { scope, value } },
        create: { scope, value, reason, actor },
        update: { reason, actor },
      });
      await db.auditEvent.create({
        data: { actor, actorRole, action: 'SUPPRESS', targetType: 'suppression', targetId: suppression.id, detailJson: JSON.stringify({ scope, value, reason }) },
      });
      await db.activityEvent.create({ data: { type: 'SYSTEM', message: `Pattern suppressed: ${scope.toLowerCase()} "${value}" — excluded from AI picks.`, metaJson: JSON.stringify({ scope, value }) } });
      return NextResponse.json({ ok: true, suppression });
    }

    if (action === 'unsuppress') {
      const id = typeof body.id === 'string' ? body.id : '';
      const existing = await db.suppression.findUnique({ where: { id } });
      if (!existing) return NextResponse.json({ error: 'suppression not found' }, { status: 404 });
      await db.suppression.delete({ where: { id } });
      await db.auditEvent.create({
        data: { actor, actorRole, action: 'UNSUPPRESS', targetType: 'suppression', targetId: id, detailJson: JSON.stringify({ scope: existing.scope, value: existing.value }) },
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'dispute') {
      const leadId = typeof body.leadId === 'string' ? body.leadId : '';
      const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 300) : '';
      if (!leadId || !reason) return NextResponse.json({ error: 'leadId and reason are required' }, { status: 400 });
      const dispute = await db.dispute.create({ data: { leadId, reason, actor } });
      await db.auditEvent.create({
        data: { actor, actorRole, action: 'DISPUTE', targetType: 'lead', targetId: leadId, detailJson: JSON.stringify({ reason, disputeId: dispute.id }) },
      });
      return NextResponse.json({ ok: true, dispute });
    }

    if (action === 'override') {
      // Trust/Override: explicit human override of a recommendation for a lead —
      // recorded as an immutable audit event and reflected in ranking feedback.
      const leadId = typeof body.leadId === 'string' ? body.leadId : '';
      const note = typeof body.note === 'string' ? body.note.slice(0, 300) : null;
      if (!leadId) return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
      await db.auditEvent.create({
        data: { actor, actorRole, action: 'OVERRIDE', targetType: 'lead', targetId: leadId, detailJson: JSON.stringify({ note }) },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (err) {
    console.error('trust action failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'trust action failed' }, { status: 500 });
  }
}
