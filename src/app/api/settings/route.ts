import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let settings = await db.settings.findUnique({ where: { id: 'singleton' } });
  if (!settings) settings = await db.settings.create({ data: { id: 'singleton' } });
  return NextResponse.json({ settings });
}

const ALLOWED = new Set([
  'onboarded',
  'marketplace',
  'plan',
  'sourcingState',
  'taxRate',
  'minRoi',
  'minProfit',
  'maxBsr',
  'minOffers',
  'excludeAmazonRetail',
  'prepCost',
  'inboundCost',
  'monthlyBudget',
  'excludedBrands',
  'excludedAsins',
]);

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (!ALLOWED.has(k)) continue;
    if (k === 'excludedBrands' || k === 'excludedAsins') {
      data[k] = JSON.stringify(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
    } else if (k === 'onboarded' || k === 'excludeAmazonRetail') {
      data[k] = Boolean(v);
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      data[k] = v;
    } else if (typeof v === 'string') {
      data[k] = v;
    }
  }
  const settings = await db.settings.update({ where: { id: 'singleton' }, data });
  return NextResponse.json({ ok: true, settings });
}
