// Seed — BuyWise consumer shopping demo data (PRD TA-PRD-SHOP-1.0).
// Called after seedOpsAndCare() so ticket refs continue from TKT-1007.
// Searches run through the real engine (narrate=false keeps them instant
// and deterministic); care tickets reuse the shared lifecycle.

import { db } from '@/lib/db';
import { runShopSearch } from './shop';

const HOURS = 3600 * 1000;

const SEARCH_SPECS = [
  { query: 'VoltEdge Bluetooth Earbuds with Charging Case', email: 'mia.torres@example.com', agoH: 26 },
  { query: 'NatureVital Collagen Peptides Powder', email: 'dev.reyes@example.com', agoH: 20 },
  { query: 'ChefCrafter Nonstick Cookware Set', email: null, agoH: 9 },
  { query: 'Turbo Wheels Remote Control Rock Crawler', email: 'mia.torres@example.com', agoH: 3 },
];

export async function seedShopDemo() {
  const now = Date.now();

  // reset consumer tables (FK-safe order)
  await db.watchItem.deleteMany();
  await db.vendorQuote.deleteMany();
  await db.consumerSearch.deleteMany();

  // demo searches through the real engine
  const searches: { id: string; productName: string; verdict: string }[] = [];
  for (const spec of SEARCH_SPECS) {
    const results = await runShopSearch(spec.query, spec.email, false);
    await db.consumerSearch.update({
      where: { id: results.search.id },
      data: { createdAt: new Date(now - spec.agoH * HOURS) },
    });
    searches.push({ id: results.search.id, productName: results.search.productName, verdict: results.search.verdict });

    // one price watch per emailed shopper on their first search
    if (spec.email === 'mia.torres@example.com' && searches.length === 1) {
      await db.watchItem.create({
        data: { searchId: results.search.id, email: spec.email, targetPrice: Math.round(results.search.bestTotal * 0.95 * 100) / 100, createdAt: new Date(now - 24 * HOURS) },
      });
    }
    if (spec.email === 'dev.reyes@example.com') {
      await db.watchItem.create({
        data: { searchId: results.search.id, email: spec.email, targetPrice: Math.round(results.search.bestTotal * 0.9 * 100) / 100, createdAt: new Date(now - 18 * HOURS) },
      });
    }
  }

  // consumer care tickets (SHOPPING category, CONSUMER type)
  const tickets = [
    {
      ref: 'TKT-1008', name: 'Mia Torres', email: 'mia.torres@example.com', searchId: searches[0]?.id,
      subject: 'Verdict said WAIT — then the price went up 8%', category: 'SHOPPING', priority: 'P2', status: 'IN_PROGRESS',
      assignee: 'Dana (Care)', agoH: 6, firstReplyAgoH: 4,
      msgs: [
        { role: 'CUSTOMER' as const, body: 'I searched the earbuds yesterday and BuyWise told me to WAIT because of a sale window. Today the cheapest vendor is 8% more expensive. What happened to the analysis?', agoH: 6 },
        { role: 'AGENT' as const, body: 'Hi Mia — I pulled the exact comparison you saw (attached on my side). The verdict was within its stated confidence, and vendor prices did move overnight: two sellers re-priced upward while the sale window is still listed. I have flagged the vendor price jump to the data team and will follow up here with what we find.', agoH: 4 },
        { role: 'AGENT' as const, body: 'Root cause looks like a marketplace seller repricing bot — worth an internal note in the connector channel if confirmed.', agoH: 3.5, internal: true },
      ],
      events: [
        { type: 'CREATED', detail: 'Ticket created from BuyWise Help with comparison attached', actor: 'Mia Torres', agoH: 6 },
        { type: 'TRIAGE', detail: 'Auto-triage: severity keywords detected — priority escalated to P2.', actor: 'System', agoH: 6 },
        { type: 'ASSIGN', detail: 'Assigned to Dana (Care)', actor: 'Dana (Care)', agoH: 5.5 },
        { type: 'REPLY', detail: 'First public reply', actor: 'Dana (Care)', agoH: 4 },
        { type: 'STATUS', detail: 'OPEN → IN_PROGRESS', actor: 'Dana (Care)', agoH: 4 },
      ],
    },
    {
      ref: 'TKT-1009', name: 'Dev Reyes', email: 'dev.reyes@example.com', searchId: searches[1]?.id,
      subject: 'Is the 24-month warranty from a marketplace seller real?', category: 'SHOPPING', priority: 'P3', status: 'OPEN',
      agoH: 2,
      msgs: [
        { role: 'CUSTOMER' as const, body: 'One of the vendors in my comparison shows a 24-month warranty. Is that honored by the brand or is it a seller promise? I do not want to buy the collagen powder from someone who disappears tomorrow.', agoH: 2 },
      ],
      events: [{ type: 'CREATED', detail: 'Ticket created from BuyWise Help with comparison attached', actor: 'Dev Reyes', agoH: 2 }],
    },
    {
      ref: 'TKT-1010', name: 'Mia Torres', email: 'mia.torres@example.com', searchId: searches[3]?.id,
      subject: 'Coupon shown in the comparison did not apply at checkout', category: 'SHOPPING', priority: 'P3', status: 'RESOLVED',
      assignee: 'Dana (Care)', agoH: 3 * 24, firstReplyAgoH: 3 * 24 - 2, resolved: true, csat: 5,
      msgs: [
        { role: 'CUSTOMER' as const, body: 'The comparison showed a 10% coupon applied for the crawler, but the vendor checkout did not honor it. The totals did not match what I saw here.', agoH: 3 * 24 },
        { role: 'AGENT' as const, body: 'You are right — that coupon expired between our data refresh and your checkout, and we kept showing it. I am sorry. We have expired-coupon detection on the vendor feed now and the comparison totals refresh every 2 hours. As a thank-you for the report I have added a 30-day BuyWise Pro watch credit to your email.', agoH: 3 * 24 - 2 },
        { role: 'CUSTOMER' as const, body: 'Confirmed the totals look fresh now. Thanks for the quick fix and the credit!', agoH: 2 * 24 },
      ],
      events: [
        { type: 'CREATED', detail: 'Ticket created from BuyWise Help with comparison attached', actor: 'Mia Torres', agoH: 3 * 24 },
        { type: 'REPLY', detail: 'First public reply', actor: 'Dana (Care)', agoH: 3 * 24 - 2 },
        { type: 'RESOLVE', detail: 'Marked resolved', actor: 'Dana (Care)', agoH: 2 * 24 + 1 },
        { type: 'CSAT', detail: 'Customer rated 5/5', actor: 'Mia Torres', agoH: 2 * 24 },
      ],
    },
  ];

  for (const t of tickets) {
    const created = new Date(now - t.agoH * HOURS);
    const firstAgent = t.msgs.find((m) => m.role === 'AGENT' && !('internal' in m && m.internal));
    const ticket = await db.supportTicket.create({
      data: {
        ref: t.ref, customerName: t.name, customerEmail: t.email, customerType: 'CONSUMER',
        subject: t.subject, category: t.category, priority: t.priority, status: t.status,
        consumerSearchId: t.searchId ?? null, assignee: t.assignee ?? null,
        firstResponseAt: t.firstReplyAgoH ? new Date(now - t.firstReplyAgoH * HOURS) : null,
        resolvedAt: t.resolved ? new Date(now - 2 * 24 * HOURS) : null,
        csat: t.csat ?? null, slaBreach: false,
        createdAt: created,
        updatedAt: new Date(now - Math.min(...t.msgs.map((m) => m.agoH)) * HOURS),
      },
    });
    for (const m of t.msgs) {
      await db.ticketMessage.create({
        data: { ticketId: ticket.id, author: m.role === 'CUSTOMER' ? t.name : 'Dana (Care)', authorRole: m.role, internal: 'internal' in m && !!m.internal, body: m.body, createdAt: new Date(now - m.agoH * HOURS) },
      });
    }
    for (const e of t.events) {
      await db.ticketEvent.create({
        data: { ticketId: ticket.id, type: e.type, detail: e.detail, actor: e.actor, createdAt: new Date(now - e.agoH * HOURS) },
      });
    }
  }

  return { searches: searches.length, tickets: tickets.length };
}
