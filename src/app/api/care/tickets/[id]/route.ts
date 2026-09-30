// Ticket 360 dashboard (PRD §6.2 — the core requirement): server-assembled
// per-ticket snapshot with customer profile, usage footprint, referenced
// entity economics, history, timeline, and thread. Plus workflow PATCH.

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { canTransition, slaState, type Ticket360DTO } from '@/lib/ta/care';
import { computeAccountHealth } from '@/lib/ta/ai/health';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ticket = await db.supportTicket.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      events: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!ticket) return NextResponse.json({ error: 'ticket not found' }, { status: 404 });

  const [settings, canned, allTickets] = await Promise.all([
    db.settings.findUnique({ where: { id: 'singleton' } }),
    db.cannedResponse.findMany({ orderBy: { createdAt: 'asc' } }),
    db.supportTicket.findMany({ where: { customerName: ticket.customerName }, orderBy: { createdAt: 'desc' }, take: 10 }),
  ]);

  // usage footprint (bounded counts, never full scans)
  const [totalLeads, freshLeads, scansets, pipelineRows, outcomes, winCount] = await Promise.all([
    db.lead.count(),
    db.lead.count({ where: { fresh: true } }),
    db.scanSet.count(),
    db.pipelineItem.groupBy({ by: ['status'], _count: true }),
    db.outcome.count(),
    db.outcome.count({ where: { win: true } }),
  ]);
  const pipeline = { NEW: 0, PURCHASED: 0, WON: 0, LOST: 0, other: 0 } as { NEW: number; PURCHASED: number; WON: number; LOST: number; other: number };
  for (const row of pipelineRows) {
    if (row.status === 'NEW' || row.status === 'PURCHASED' || row.status === 'WON' || row.status === 'LOST') pipeline[row.status] = row._count;
    else pipeline.other += row._count;
  }

  // referenced entity deep snapshot
  let lead: Ticket360DTO['referenced']['lead'] = null;
  if (ticket.leadId) {
    const l = await db.lead.findUnique({ where: { id: ticket.leadId }, include: { match: true } });
    if (l) {
      const listing = await db.amazonListing.findUnique({ where: { id: l.listingId } });
      let history: { d: string; p: number }[] = [];
      if (listing) {
        try {
          history = (JSON.parse(listing.historyJson) as { d: string; p: number; r: number }[]).slice(-30).map((h) => ({ d: h.d, p: h.p }));
        } catch { /* ignore */ }
      }
      lead = {
        id: l.id, asin: l.asin, title: l.title, brand: l.brand, category: l.category, imageUrl: l.imageUrl,
        retailerName: l.retailerName, retailerPrice: l.retailerPrice, buyBox: l.buyBox,
        netProfit: l.netProfit, roiPct: l.roiPct, marginPct: l.marginPct, breakeven: l.breakeven,
        totalCost: l.totalCost, riskFlags: l.riskFlags, priceAgeH: l.priceAgeH, fresh: l.fresh,
        bsr: l.bsr, score: l.score, firstSeenAt: l.firstSeenAt.toISOString(), history,
      };
    }
  }
  let retailer: Ticket360DTO['referenced']['retailer'] = null;
  if (ticket.retailerId) {
    const r = await db.retailer.findUnique({ where: { id: ticket.retailerId } });
    if (r) {
      retailer = { id: r.id, name: r.name, domain: r.domain, tier: r.tier, status: r.status, coverage: r.coverage, cadenceHours: r.cadenceHours, lastScanAt: r.lastScanAt?.toISOString() ?? null };
    }
  }

  // related activity touching the referenced entity (from the existing feed)
  const relatedActivity = await db.activityEvent.findMany({
    where: ticket.leadId ? { OR: [{ message: { contains: ticket.leadId.slice(0, 8) } }, { type: { in: ['SCAN', 'MATCH', 'PRICE_DROP'] } }] } : {},
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: { id: true, type: true, message: true, createdAt: true },
  });

  // account health (reuses the AI health engine)
  let health: { score: number; band: string } | null = null;
  try {
    const h = await computeAccountHealth();
    health = { score: h.score, band: h.label };
  } catch { /* health is optional context */ }

  // BuyWise consumer context (TA-PRD-SHOP-1.0 §9.2): shopper profile, shopping
  // footprint, and the referenced comparison exactly as the customer saw it.
  let consumer: Ticket360DTO['consumer'] = null;
  if (ticket.customerType === 'CONSUMER') {
    const email = ticket.customerEmail ?? '';
    const searchWhere = email ? { customerEmail: email } : { id: ticket.consumerSearchId ?? '__none__' };
    const [cSearches, searchCount, watchCount, firstTicket] = await Promise.all([
      db.consumerSearch.findMany({ where: searchWhere, orderBy: { createdAt: 'desc' }, take: 8 }),
      db.consumerSearch.count({ where: searchWhere }),
      db.watchItem.count({ where: email ? { email } : { searchId: ticket.consumerSearchId ?? '__none__' } }),
      db.supportTicket.findFirst({ where: { customerType: 'CONSUMER', ...(email ? { customerEmail: email } : {}) }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    ]);
    let referencedSearch: NonNullable<Ticket360DTO['consumer']>['referencedSearch'] = null;
    const refId = ticket.consumerSearchId ?? cSearches[0]?.id ?? null;
    if (refId) {
      const cs = await db.consumerSearch.findUnique({ where: { id: refId }, include: { quotes: { orderBy: { total: 'asc' }, take: 9 } } });
      if (cs) {
        referencedSearch = {
          id: cs.id, productName: cs.productName, brand: cs.brand, category: cs.category,
          verdict: cs.verdict, confidence: cs.confidence, narrative: cs.narrative, engineLabel: cs.engineLabel,
          bestVendor: cs.bestVendor, bestTotal: cs.bestTotal, worstTotal: cs.worstTotal,
          fairPercentile: cs.fairPercentile, priceLow90: cs.priceLow90, priceHigh90: cs.priceHigh90,
          createdAt: cs.createdAt.toISOString(),
          quotes: cs.quotes.map((q) => ({
            vendor: q.vendor, vendorType: q.vendorType, total: q.total, price: q.price,
            shipping: q.shipping, tax: q.tax, inStock: q.inStock, etaDays: q.etaDays,
            rating: q.rating, returnDays: q.returnDays, badges: JSON.parse(q.badgesJson) as string[],
          })),
        };
      }
    }
    consumer = {
      email,
      shopperSince: (firstTicket?.createdAt ?? ticket.createdAt).toISOString(),
      searchCount, watchCount,
      lastVerdict: cSearches[0]?.verdict ?? null,
      searches: cSearches.map((s) => ({ id: s.id, productName: s.productName, verdict: s.verdict, confidence: s.confidence, bestVendor: s.bestVendor, bestTotal: s.bestTotal, createdAt: s.createdAt.toISOString() })),
      referencedSearch,
    };
  }

  const dto: Ticket360DTO = {
    ticket: {
      id: ticket.id, ref: ticket.ref, subject: ticket.subject, category: ticket.category,
      priority: ticket.priority, status: ticket.status, assignee: ticket.assignee,
      createdAt: ticket.createdAt.toISOString(), updatedAt: ticket.updatedAt.toISOString(),
      firstResponseAt: ticket.firstResponseAt?.toISOString() ?? null,
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      csat: ticket.csat, slaBreach: ticket.slaBreach,
      leadId: ticket.leadId, retailerId: ticket.retailerId, scanSetId: ticket.scanSetId,
      customerType: ticket.customerType, customerEmail: ticket.customerEmail, consumerSearchId: ticket.consumerSearchId,
    },
    sla: slaState(ticket),
    customer: {
      name: ticket.customerName,
      plan: settings?.plan ?? 'PRO', planPrice: settings?.plan === 'EXPERT' ? 149 : settings?.plan === 'PRO' ? 79 : 29,
      billingCycle: 'annual', trialEndsAt: settings?.trialEndsAt?.toISOString() ?? null,
      onboarded: settings?.onboarded ?? false, marketplace: settings?.marketplace ?? 'US',
      sourcingState: settings?.sourcingState ?? 'MT',
      health,
    },
    usage: {
      totalLeads, freshLeads, scansets, pipeline, outcomesLogged: outcomes,
      winRate: outcomes ? Math.round((winCount / outcomes) * 100) : null,
    },
    referenced: { kind: lead ? 'lead' : retailer ? 'retailer' : null, lead, retailer },
    consumer,
    pastTickets: allTickets
      .filter((t) => t.id !== ticket.id)
      .map((t) => ({ id: t.id, ref: t.ref, subject: t.subject, status: t.status, category: t.category, createdAt: t.createdAt.toISOString(), csat: t.csat })),
    relatedActivity: relatedActivity.map((a) => ({ id: a.id, type: a.type, message: a.message, createdAt: a.createdAt.toISOString() })),
    messages: ticket.messages.map((m) => ({ id: m.id, author: m.author, authorRole: m.authorRole, internal: m.internal, body: m.body, createdAt: m.createdAt.toISOString() })),
    events: ticket.events.map((e) => ({ id: e.id, type: e.type, detail: e.detail, actor: e.actor, createdAt: e.createdAt.toISOString() })),
    canned: canned.map((c) => ({ id: c.id, title: c.title, body: c.body })),
  };
  return NextResponse.json(dto);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const current = await db.supportTicket.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: 'ticket not found' }, { status: 404 });

    const data: Record<string, unknown> = {};

    if (typeof body.status === 'string' && body.status !== current.status) {
      if (!canTransition(current.status, body.status)) {
        return NextResponse.json({ error: `cannot move ${current.status} → ${body.status}` }, { status: 422 });
      }
      data.status = body.status;
      if (body.status === 'RESOLVED') data.resolvedAt = new Date();
      if (body.status === 'OPEN' && (current.status === 'RESOLVED' || current.status === 'CLOSED')) {
        data.resolvedAt = null; // reopen resets resolution clock
        await db.ticketEvent.create({ data: { ticketId: id, type: 'REOPEN', detail: `${current.status} → OPEN`, actor: typeof body.actor === 'string' ? body.actor : 'Dana (Care)' } });
      } else {
        await db.ticketEvent.create({ data: { ticketId: id, type: body.status === 'RESOLVED' ? 'RESOLVE' : 'STATUS', detail: `${current.status} → ${body.status}`, actor: typeof body.actor === 'string' ? body.actor : 'Dana (Care)' } });
      }
      if (body.status === 'RESOLVED') {
        await db.notification.create({
          data: { kind: 'RISK_ALERT', title: `Ticket ${current.ref} resolved`, body: `${current.subject} — let us know if this fixed it (reopens for 7 days).`, deepLink: '/?view=support', channel: 'push' },
        });
      }
    }

    if (typeof body.priority === 'string' && ['P1', 'P2', 'P3'].includes(body.priority) && body.priority !== current.priority) {
      data.priority = body.priority;
      await db.ticketEvent.create({ data: { ticketId: id, type: 'PRIORITY', detail: `${current.priority} → ${body.priority}`, actor: typeof body.actor === 'string' ? body.actor : 'Dana (Care)' } });
    }

    if (typeof body.assignee === 'string' && body.assignee !== current.assignee) {
      data.assignee = body.assignee || null;
      await db.ticketEvent.create({ data: { ticketId: id, type: 'ASSIGN', detail: body.assignee ? `Assigned to ${body.assignee}` : 'Unassigned', actor: typeof body.actor === 'string' ? body.actor : 'Dana (Care)' } });
    }

    if (Number.isFinite(body.csat) && !current.csat) {
      const csat = Math.max(1, Math.min(5, Math.round(body.csat)));
      data.csat = csat;
      await db.ticketEvent.create({ data: { ticketId: id, type: 'CSAT', detail: `Customer rated ${csat}/5`, actor: current.customerName } });
    }

    const ticket = await db.supportTicket.update({ where: { id }, data });
    return NextResponse.json({ ok: true, ticket });
  } catch (err) {
    console.error('ticket patch failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'patch failed' }, { status: 500 });
  }
}
