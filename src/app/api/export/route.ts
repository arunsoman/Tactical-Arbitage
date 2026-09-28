import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { buildLeadWhere, parseLeadQuery, postFilterRiskFlags, leadsToCsv } from '@/lib/ta/filters';

export const dynamic = 'force-dynamic';

/** CSV export of any results view (FR-8.1) or the pipeline. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? 'leads';
  const settings = (await db.settings.findUnique({ where: { id: 'singleton' } }))!;

  if (type === 'pipeline') {
    const items = await db.pipelineItem.findMany({
      include: { lead: { select: { asin: true, title: true, brand: true, category: true, retailerName: true, retailerPrice: true, buyBox: true, netProfit: true, roiPct: true, bsr: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    const rows = items.map((i) => ({
      status: i.status,
      qty: i.qty,
      owner: i.owner,
      notes: i.notes ?? '',
      tags: (i.tags ?? '[]').replace(/[[\]"]/g, ''),
      asin: i.lead.asin,
      title: i.lead.title,
      brand: i.lead.brand,
      category: i.lead.category,
      retailer: i.lead.retailerName,
      retailerPrice: i.lead.retailerPrice,
      buyBox: i.lead.buyBox,
      netProfit: i.lead.netProfit,
      roiPct: i.lead.roiPct,
      bsr: i.lead.bsr,
      updatedAt: i.updatedAt.toISOString(),
    }));
    const csv = [
      'status,qty,owner,notes,tags,asin,title,brand,category,retailer,retailerPrice,buyBox,netProfit,roiPct,bsr,updatedAt',
      ...rows.map((r) =>
        [r.status, r.qty, r.owner, `"${(r.notes ?? '').replace(/"/g, '""')}"`, `"${r.tags}"`, r.asin, `"${r.title.replace(/"/g, '""')}"`, r.brand, r.category, r.retailer, r.retailerPrice, r.buyBox, r.netProfit, r.roiPct, r.bsr, r.updatedAt].join(',')
      ),
    ].join('\n');
    return new NextResponse(csv, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ta-pipeline-${new Date().toISOString().slice(0, 10)}.csv"` },
    });
  }

  const q = parseLeadQuery(searchParams);
  const where = buildLeadWhere(q.filters, settings);
  const rowsRaw = await db.lead.findMany({ where, orderBy: { score: 'desc' }, take: 5000 });
  const rows = postFilterRiskFlags(rowsRaw, q.filters.excludeFlags);
  const csv = leadsToCsv(rows as unknown as Record<string, unknown>[]);
  return new NextResponse(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ta-leads-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
