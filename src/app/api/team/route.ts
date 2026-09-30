// VA / Team (§5): roles Owner / Manager / VA, membership management. Every
// mutation lands in the immutable audit trail.

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ROLES = ['OWNER', 'MANAGER', 'VA'];

export async function GET() {
  const [members, approvals] = await Promise.all([
    db.teamMember.findMany({ orderBy: [{ role: 'asc' }, { name: 'asc' }] }),
    db.approvalRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }),
  ]);
  return NextResponse.json({ members, approvals });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
    const role = ROLES.includes(body.role) ? body.role : null;
    if (!name || !role) return NextResponse.json({ error: 'name and a valid role are required' }, { status: 400 });
    const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim().slice(0, 120) : null;

    const member = await db.teamMember.create({ data: { name, role, email } });
    await db.auditEvent.create({
      data: { actor: 'Sofia', actorRole: 'OWNER', action: 'SETTINGS', targetType: 'team', targetId: member.id, detailJson: JSON.stringify({ added: name, role }) },
    });
    return NextResponse.json({ ok: true, member });
  } catch (err) {
    console.error('team add failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'team add failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const data: { role?: string; active?: boolean } = {};
    if (ROLES.includes(body.role)) data.role = body.role;
    if (typeof body.active === 'boolean') data.active = body.active;
    const member = await db.teamMember.update({ where: { id }, data });
    await db.auditEvent.create({
      data: { actor: 'Sofia', actorRole: 'OWNER', action: 'SETTINGS', targetType: 'team', targetId: id, detailJson: JSON.stringify(data) },
    });
    return NextResponse.json({ ok: true, member });
  } catch (err) {
    console.error('team update failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'team update failed' }, { status: 500 });
  }
}
