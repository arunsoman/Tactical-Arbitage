import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { seedDatabase } from '@/lib/ta/seed';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await seedDatabase();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('seed failed', err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'seed failed' }, { status: 500 });
  }
}

export async function GET() {
  const counts = {
    retailers: await db.retailer.count(),
    listings: await db.amazonListing.count(),
    products: await db.retailerProduct.count(),
    leads: await db.lead.count(),
    pipeline: await db.pipelineItem.count(),
    settings: await db.settings.count(),
  };
  return NextResponse.json({ seeded: counts.leads > 0, counts });
}
