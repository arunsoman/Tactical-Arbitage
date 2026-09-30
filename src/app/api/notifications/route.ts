// Notifications (§4 US-6): actionable list with one-line reason + deep link.
// PATCH marks one or all as read.

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [notifications, unread] = await Promise.all([
    db.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    db.notification.count({ where: { read: false } }),
  ]);
  return NextResponse.json({ notifications, unread });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.all) {
    await db.notification.updateMany({ data: { read: true } });
    return NextResponse.json({ ok: true });
  }
  if (typeof body.id === 'string') {
    await db.notification.update({ where: { id: body.id }, data: { read: true } }).catch(() => null);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'id or all required' }, { status: 400 });
}
