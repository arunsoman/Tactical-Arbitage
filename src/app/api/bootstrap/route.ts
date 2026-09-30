import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { PLANS } from '@/lib/ta/types';

export const dynamic = 'force-dynamic';

/** One-shot app bootstrap: settings + retailer list + categories + headline counts.
 *  Also records the device session (mobile vs desktop analytics, PRD v2.2 §6). */
export async function GET(req: NextRequest) {
  let settings = await db.settings.findUnique({ where: { id: 'singleton' } });
  if (!settings) {
    settings = await db.settings.create({ data: { id: 'singleton' } });
  }

  const ua = req.headers.get('user-agent') ?? '';
  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

  const [
    retailers, categories, totalLeads, freshLeads, reviewQueue, pipelineCount, scansets,
    unreadNotifications, pendingApprovals, pendingOutcomes, openCareTickets,
  ] = await Promise.all([
    db.retailer.findMany({
      select: { id: true, name: true, domain: true, tier: true, status: true, cadenceHours: true, coverage: true },
      orderBy: [{ tier: 'asc' }, { name: 'asc' }],
    }),
    db.amazonListing.findMany({ select: { category: true }, distinct: ['category'], orderBy: { category: 'asc' } }),
    db.lead.count(),
    db.lead.count({ where: { fresh: true } }),
    db.match.count({ where: { status: 'REVIEW', flagged: false } }),
    db.pipelineItem.count(),
    db.scanSet.count(),
    db.notification.count({ where: { read: false } }),
    db.approvalRequest.count({ where: { status: 'PENDING' } }),
    // pending outcome prompts: purchased+ pipeline items without a logged outcome
    db.pipelineItem.count({
      where: {
        status: { in: ['PURCHASED', 'SHIPPED', 'LIVE'] },
        lead: { outcomes: { none: {} } },
      },
    }),
    // open care tickets (Care Portal badge, PRD TA-PRD-CARE-1.0)
    db.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER'] } } }),
  ]);

  // device/session context — fire and forget (never blocks bootstrap)
  void db.deviceSession.create({ data: { device: isMobileUA ? 'mobile' : 'desktop', ua: ua.slice(0, 200) } }).catch(() => null);

  return NextResponse.json({
    settings,
    plan: PLANS[settings.plan as keyof typeof PLANS] ?? PLANS.PRO,
    retailers,
    categories: categories.map((c) => c.category),
    counts: {
      totalLeads, freshLeads, reviewQueue, pipelineCount, scansets,
      unreadNotifications, pendingApprovals, pendingOutcomes, openCareTickets,
    },
  });
}
