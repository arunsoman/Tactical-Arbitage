import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { parseJsonArray } from '@/lib/ta/types';
import { loadScanIndex, scansForLead } from '@/lib/ta/scanAttribution';
import { buyUrl } from '@/lib/ta/buyLink';
import { round2 } from '@/lib/ta/profit';

export const dynamic = 'force-dynamic';

/** Lead detail drawer payload: full fee breakdown, match provenance, Keepa-style history. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const lead = await db.lead.findUnique({
    where: { id },
    include: {
      match: { include: { retailerProduct: true } },
      pipeline: true,
    },
  });
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  // listing + retailer are plain columns on Lead (denormalized deal store), so fetch directly
  const [listing, retailer] = await Promise.all([
    db.amazonListing.findUnique({ where: { id: lead.listingId } }),
    db.retailer.findUnique({ where: { id: lead.retailerId } }),
  ]);
  if (!listing || !retailer) return NextResponse.json({ error: 'Referenced listing/retailer missing' }, { status: 404 });

  const history = JSON.parse(listing.historyJson || '[]');
  const historyPoints = Array.isArray(history) ? history : [];

  const [index, settings] = await Promise.all([loadScanIndex(), db.settings.findUnique({ where: { id: 'singleton' } })]);
  return NextResponse.json({
    buyUrl: buyUrl(retailer.domain, lead.title),
    scans: scansForLead(lead, index, settings ?? { excludeAmazonRetail: false }),
    lead: { ...lead, riskFlagList: parseJsonArray(lead.riskFlags) },
    match: {
      method: lead.match.method,
      confidence: lead.match.confidence,
      status: lead.match.status,
      flagged: lead.match.flagged,
      flagNote: lead.match.flagNote,
      packCount: lead.match.retailerProduct.packCount,
      unitSize: lead.match.retailerProduct.unitSize,
      upc: lead.match.retailerProduct.upc,
      sku: lead.match.retailerProduct.sku,
    },
    listing: {
      ...listing,
      history: historyPoints,
      keepa30Avg: round2(listing.keepa30Avg),
      keepa90Avg: round2(listing.keepa90Avg),
    },
    retailer: {
      id: retailer.id,
      name: retailer.name,
      domain: retailer.domain,
      tier: retailer.tier,
      cadenceHours: retailer.cadenceHours,
      status: retailer.status,
    },
    pipeline: lead.pipeline,
  });
}
