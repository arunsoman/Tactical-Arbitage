import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { loadScanIndex, scansForLead } from '@/lib/ta/scanAttribution';
import { buyUrl } from '@/lib/ta/buyLink';
import { parseJsonArray, warningFlags, RISK_FLAG_META } from '@/lib/ta/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const items = await db.pipelineItem.findMany({
    include: {
      lead: {
        select: {
          id: true,
          asin: true,
          title: true,
          brand: true,
          category: true,
          imageUrl: true,
          retailerName: true,
          retailerPrice: true,
          buyBox: true,
          netProfit: true,
          roiPct: true,
          bsr: true,
          riskFlags: true,
          score: true,
          firstSeenAt: true,
          retailerId: true,
          discountPct: true,
          fbaOffers: true,
          fresh: true,
          amazonRetail: true,
          foundByScanId: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
  const [index, settings, retailers] = await Promise.all([
    loadScanIndex(),
    db.settings.findUnique({ where: { id: 'singleton' } }),
    db.retailer.findMany({ select: { id: true, domain: true } }),
  ]);
  const domainById = new Map(retailers.map((r) => [r.id, r.domain]));
  const withScans = items.map((i) => ({
    ...i,
    buyUrl: domainById.has(i.lead.retailerId) ? buyUrl(domainById.get(i.lead.retailerId)!, i.lead.title) : null,
    lead: { ...i.lead, scans: scansForLead(i.lead, index, settings ?? { excludeAmazonRetail: false }) },
  }));
  return NextResponse.json({ items: withScans });
}

/** Save a lead to the pipeline (FR-7.1). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const leadId = typeof body.leadId === 'string' ? body.leadId : null;
  if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const existing = await db.pipelineItem.findUnique({ where: { leadId } });
  if (existing) return NextResponse.json({ ok: true, item: existing, existed: true });

  const item = await db.pipelineItem.create({
    data: {
      leadId,
      status: typeof body.status === 'string' ? body.status : 'NEW',
      expectedProfit: lead.netProfit,
      expectedRoi: lead.roiPct,
      buyPrice: lead.retailerPrice,
    },
  });
  const warnings = warningFlags(parseJsonArray(lead.riskFlags)).map((f) => RISK_FLAG_META[f].label);
  await db.activityEvent.create({
    data: { type: 'PIPELINE', message: `Lead saved to pipeline: ${lead.title.slice(0, 60)} (${lead.retailerName} → ${lead.asin})` },
  });
  return NextResponse.json({ ok: true, item, existed: false, warnings });
}
