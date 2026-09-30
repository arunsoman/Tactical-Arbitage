// Care queue + ticket creation (PRD TA-PRD-CARE-1.0 §5/§6.1).
// GET: agent queue (filters) — in this single-tenant demo the customer list is
// the same set. POST: create with deterministic auto-triage + confirmation.

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { autoTriage, nextTicketRef, slaState, DEFAULT_PRIORITY, CATEGORIES } from '@/lib/ta/care';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const status = params.get('status') ?? 'ALL';
  const category = params.get('category') ?? 'ALL';
  const priority = params.get('priority') ?? 'ALL';
  const customerType = params.get('customerType') ?? 'ALL';
  const email = params.get('email');
  const q = (params.get('q') ?? '').toLowerCase().slice(0, 80);

  const where: Record<string, unknown> = {};
  if (status !== 'ALL') where.status = status;
  if (category !== 'ALL') where.category = category;
  if (priority !== 'ALL') where.priority = priority;
  if (customerType !== 'ALL') where.customerType = customerType;
  if (email) where.customerEmail = email;

  const tickets = await db.supportTicket.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }],
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });

  const rows = tickets
    .filter((t) => !q || t.subject.toLowerCase().includes(q) || t.ref.toLowerCase().includes(q))
    .map((t) => ({
      id: t.id, ref: t.ref, subject: t.subject, category: t.category, priority: t.priority,
      status: t.status, assignee: t.assignee, customerName: t.customerName,
      customerType: t.customerType, customerEmail: t.customerEmail,
      createdAt: t.createdAt, updatedAt: t.updatedAt, firstResponseAt: t.firstResponseAt,
      resolvedAt: t.resolvedAt, csat: t.csat, slaBreach: t.slaBreach,
      hasLead: !!t.leadId, hasRetailer: !!t.retailerId, hasScanSet: !!t.scanSetId, hasSearch: !!t.consumerSearchId,
      lastMessage: t.messages[0] ? { authorRole: t.messages[0].authorRole, internal: t.messages[0].internal, createdAt: t.messages[0].createdAt } : null,
      sla: slaState(t),
    }));

  // SLA-urgency sort: breached first, then time-to-breach ascending
  rows.sort((a, b) => {
    if (a.sla.kind === 'breach' && b.sla.kind !== 'breach') return -1;
    if (b.sla.kind === 'breach' && a.sla.kind !== 'breach') return 1;
    if (a.sla.kind === 'done' && b.sla.kind !== 'done') return 1;
    if (b.sla.kind === 'done' && a.sla.kind !== 'done') return -1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const counts = {
    open: tickets.filter((t) => t.status === 'OPEN').length,
    inProgress: tickets.filter((t) => t.status === 'IN_PROGRESS').length,
    waiting: tickets.filter((t) => t.status === 'WAITING_CUSTOMER').length,
    resolved: tickets.filter((t) => t.status === 'RESOLVED').length,
    closed: tickets.filter((t) => t.status === 'CLOSED').length,
    breached: rows.filter((r) => r.sla.kind === 'breach').length,
  };

  return NextResponse.json({ tickets: rows, counts });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 140) : '';
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 4000) : '';
    const category = CATEGORIES.includes(body.category) ? body.category : 'OTHER';
    if (!subject || !description) {
      return NextResponse.json({ error: 'subject and description are required' }, { status: 400 });
    }

    const triage = autoTriage(subject, description, category);
    const priority = ['P1', 'P2', 'P3'].includes(body.priority) ? body.priority : triage.suggestedPriority;
    const settings = await db.settings.findUnique({ where: { id: 'singleton' } });

    // customer identity: BuyWise shoppers supply their own name/email (§9.1)
    const customerType = body.customerType === 'CONSUMER' ? 'CONSUMER' : 'ARBITRAGE';
    const customerName = customerType === 'CONSUMER'
      ? (typeof body.customerName === 'string' && body.customerName.trim() ? body.customerName.trim().slice(0, 80) : 'BuyWise Shopper')
      : (settings ? 'Scaling Sofia' : 'Customer');
    const customerEmail = customerType === 'CONSUMER' && typeof body.customerEmail === 'string' && body.customerEmail.trim()
      ? body.customerEmail.trim().slice(0, 120)
      : null;

    // entity attachments are validated to exist
    let leadId: string | null = null;
    if (typeof body.leadId === 'string' && body.leadId) {
      const lead = await db.lead.findUnique({ where: { id: body.leadId } });
      if (!lead) return NextResponse.json({ error: 'attached deal not found' }, { status: 404 });
      leadId = lead.id;
    }
    let retailerId: string | null = null;
    if (typeof body.retailerId === 'string' && body.retailerId) {
      const retailer = await db.retailer.findUnique({ where: { id: body.retailerId } });
      if (!retailer) return NextResponse.json({ error: 'attached retailer not found' }, { status: 404 });
      retailerId = retailer.id;
    }
    let consumerSearchId: string | null = null;
    if (typeof body.consumerSearchId === 'string' && body.consumerSearchId) {
      const cs = await db.consumerSearch.findUnique({ where: { id: body.consumerSearchId } });
      if (!cs) return NextResponse.json({ error: 'attached search not found' }, { status: 404 });
      consumerSearchId = cs.id;
    }

    const latest = await db.supportTicket.findFirst({ orderBy: { ref: 'desc' }, select: { ref: true } });

    const ticket = await db.supportTicket.create({
      data: {
        ref: nextTicketRef(latest?.ref),
        customerName, customerEmail, customerType,
        subject, category, priority, status: 'OPEN',
        leadId, retailerId, consumerSearchId,
        scanSetId: typeof body.scanSetId === 'string' && body.scanSetId ? body.scanSetId : null,
        slaBreach: false,
      },
    });
    await db.ticketMessage.create({
      data: { ticketId: ticket.id, author: ticket.customerName, authorRole: 'CUSTOMER', body: description },
    });
    await db.ticketEvent.create({
      data: { ticketId: ticket.id, type: 'CREATED', detail: `Ticket created${customerType === 'CONSUMER' ? ' from BuyWise Help' : ' from Settings → Help & Support'} (${category}, suggested priority ${DEFAULT_PRIORITY[category]})`, actor: ticket.customerName },
    });
    await db.ticketEvent.create({
      data: { ticketId: ticket.id, type: 'TRIAGE', detail: triage.note, actor: 'System' },
    });
    await db.notification.create({
      data: {
        kind: 'RISK_ALERT',
        title: `Care ticket ${ticket.ref} opened`,
        body: `${ticket.subject} — routed as ${category} / ${ticket.priority} (${customerType.toLowerCase()}).`,
        deepLink: customerType === 'CONSUMER' ? '/?portal=shop&page=help' : '/?view=support',
        channel: 'email',
      },
    });
    await db.auditEvent.create({
      data: { actor: ticket.customerName, actorRole: 'OWNER', action: 'TICKET', targetType: 'support_ticket', targetId: ticket.ref, detailJson: JSON.stringify({ category, priority, leadAttached: !!leadId }) },
    });

    return NextResponse.json({
      ok: true,
      ticket: { id: ticket.id, ref: ticket.ref, priority: ticket.priority, category: ticket.category },
      triageNote: triage.note,
    });
  } catch (err) {
    console.error('ticket create failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'create failed' }, { status: 500 });
  }
}
