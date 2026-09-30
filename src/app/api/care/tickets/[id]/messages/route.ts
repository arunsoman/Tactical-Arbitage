// Ticket thread messages (PRD §6.3): public replies and agent-only internal
// notes. First public agent reply stamps firstResponseAt (FRT SLA freeze)
// and moves OPEN → IN_PROGRESS automatically.

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const text = typeof body.body === 'string' ? body.body.trim().slice(0, 4000) : '';
    const internal = body.internal === true;
    const role = body.role === 'CUSTOMER' ? 'CUSTOMER' : 'AGENT';
    if (!text) return NextResponse.json({ error: 'body is required' }, { status: 400 });

    const ticket = await db.supportTicket.findUnique({ where: { id } });
    if (!ticket) return NextResponse.json({ error: 'ticket not found' }, { status: 404 });
    if (['RESOLVED', 'CLOSED'].includes(ticket.status) && role === 'CUSTOMER') {
      return NextResponse.json({ error: 'ticket is closed — reopen it to reply' }, { status: 422 });
    }

    const author = role === 'CUSTOMER' ? ticket.customerName : 'Dana (Care)';
    const message = await db.ticketMessage.create({
      data: { ticketId: ticket.id, author, authorRole: role, internal, body: text },
    });

    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (role === 'AGENT' && !internal) {
      if (!ticket.firstResponseAt) data.firstResponseAt = new Date();
      if (ticket.status === 'OPEN') data.status = 'IN_PROGRESS';
    }
    await db.supportTicket.update({ where: { id }, data });

    if (!internal) {
      await db.ticketEvent.create({ data: { ticketId: ticket.id, type: 'REPLY', detail: ticket.firstResponseAt ? 'Reply' : 'First public reply', actor: author } });
      if (role === 'AGENT') {
        await db.notification.create({
          data: { kind: 'RISK_ALERT', title: `Re: ticket ${ticket.ref}`, body: `${author} replied to "${ticket.subject}".`, deepLink: '/?view=support', channel: 'push' },
        });
      }
    } else {
      await db.ticketEvent.create({ data: { ticketId: ticket.id, type: 'REPLY', detail: 'Internal note added', actor: author } });
    }

    return NextResponse.json({ ok: true, message: { ...message, createdAt: message.createdAt.toISOString() } });
  } catch (err) {
    console.error('message create failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'reply failed' }, { status: 500 });
  }
}
