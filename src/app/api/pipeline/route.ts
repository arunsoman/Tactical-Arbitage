import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';

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
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json({ items });
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
    data: { leadId, status: typeof body.status === 'string' ? body.status : 'NEW' },
  });
  await db.activityEvent.create({
    data: { type: 'PIPELINE', message: `Lead saved to pipeline: ${lead.title.slice(0, 60)} (${lead.retailerName} → ${lead.asin})` },
  });
  return NextResponse.json({ ok: true, item, existed: false });
}
