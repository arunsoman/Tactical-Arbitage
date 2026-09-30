// Approval workflow (§5 VA / Team): VA-initiated buys and suppressions require
// Manager/Owner sign-off. Approving a SUPPRESS executes it; approving a BUY
// creates the pipeline entry — both land in the audit trail.

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const approvals = await db.approvalRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 30 });
  const pending = approvals.filter((a) => a.status === 'PENDING').length;
  return NextResponse.json({ approvals, pending });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const kind = ['BUY', 'SUPPRESS'].includes(body.kind) ? body.kind : null;
    const leadId = typeof body.leadId === 'string' ? body.leadId : null;
    const requestedBy = typeof body.requestedBy === 'string' && body.requestedBy.trim() ? body.requestedBy.trim().slice(0, 60) : 'VA';
    if (!kind) return NextResponse.json({ error: 'kind required (BUY | SUPPRESS)' }, { status: 400 });

    const approval = await db.approvalRequest.create({
      data: { kind, leadId, payloadJson: body.payload ? JSON.stringify(body.payload) : null, requestedBy },
    });
    await db.notification.create({
      data: {
        kind: 'APPROVAL',
        title: kind === 'BUY' ? 'Approval needed: purchase' : 'Approval needed: suppression',
        body: `${requestedBy} requests approval${leadId ? ` for ${leadId.slice(-6)}` : ''}.`,
        leadId,
        deepLink: leadId ? `/?deal=${leadId}` : '/?view=team',
        channel: 'push',
      },
    });
    await db.auditEvent.create({
      data: { actor: requestedBy, actorRole: 'VA', action: 'APPROVE', targetType: 'approval', targetId: approval.id, detailJson: JSON.stringify({ requested: true, kind }) },
    });
    return NextResponse.json({ ok: true, approval });
  } catch (err) {
    console.error('approval create failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'approval create failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === 'string' ? body.id : '';
    const decision = body.decision === 'APPROVED' || body.decision === 'REJECTED' ? body.decision : null;
    const decidedBy = typeof body.decidedBy === 'string' && body.decidedBy.trim() ? body.decidedBy.trim().slice(0, 60) : 'Sofia';
    const decidedByRole = ['OWNER', 'MANAGER'].includes(body.decidedByRole) ? body.decidedByRole : 'OWNER';
    if (!id || !decision) return NextResponse.json({ error: 'id and decision required' }, { status: 400 });

    const approval = await db.approvalRequest.update({
      where: { id },
      data: { status: decision, decidedBy, decidedAt: new Date() },
    });

    if (decision === 'APPROVED') {
      const payload = approval.payloadJson ? (JSON.parse(approval.payloadJson) as Record<string, unknown>) : {};
      if (approval.kind === 'SUPPRESS' && typeof payload.scope === 'string' && typeof payload.value === 'string') {
        await db.suppression.upsert({
          where: { scope_value: { scope: payload.scope, value: payload.value } },
          create: { scope: payload.scope, value: payload.value, reason: typeof payload.reason === 'string' ? payload.reason : null, actor: decidedBy },
          update: { actor: decidedBy },
        });
      }
      if (approval.kind === 'BUY' && approval.leadId) {
        await db.pipelineItem.upsert({
          where: { leadId: approval.leadId },
          create: { leadId: approval.leadId, status: 'PURCHASED', owner: approval.requestedBy },
          update: { status: 'PURCHASED' },
        });
      }
    }

    await db.auditEvent.create({
      data: { actor: decidedBy, actorRole: decidedByRole, action: decision === 'APPROVED' ? 'APPROVE' : 'REJECT', targetType: 'approval', targetId: id, detailJson: JSON.stringify({ kind: approval.kind, requestedBy: approval.requestedBy }) },
    });
    return NextResponse.json({ ok: true, approval });
  } catch (err) {
    console.error('approval decision failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'approval decision failed' }, { status: 500 });
  }
}
