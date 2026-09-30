// GET /api/shop/watch — watches for an email (FR-4).
// POST /api/shop/watch — create or update a watch (duplicate → target update).
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const email = new URL(req.url).searchParams.get('email');
  if (!email) return NextResponse.json({ watches: [] });
  const rows = await db.watchItem.findMany({
    where: { email, active: true },
    orderBy: { createdAt: 'desc' },
    include: { search: { select: { id: true, productName: true, bestTotal: true, verdict: true, imageUrl: true, createdAt: true } } },
  });
  return NextResponse.json({
    watches: rows.map((w) => ({
      id: w.id, email: w.email, targetPrice: w.targetPrice, createdAt: w.createdAt.toISOString(),
      search: { id: w.search.id, productName: w.search.productName, bestTotal: w.search.bestTotal, verdict: w.search.verdict, imageUrl: w.search.imageUrl, createdAt: w.search.createdAt.toISOString() },
    })),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const searchId = typeof body.searchId === 'string' ? body.searchId : '';
    const email = typeof body.email === 'string' ? body.email.trim().slice(0, 120) : '';
    const targetPrice = Number(body.targetPrice);
    if (!searchId || !email || !Number.isFinite(targetPrice) || targetPrice <= 0) {
      return NextResponse.json({ error: 'searchId, email and a positive targetPrice are required' }, { status: 400 });
    }
    const search = await db.consumerSearch.findUnique({ where: { id: searchId } });
    if (!search) return NextResponse.json({ error: 'search not found' }, { status: 404 });
    const existing = await db.watchItem.findFirst({ where: { searchId, email, active: true } });
    const watch = existing
      ? await db.watchItem.update({ where: { id: existing.id }, data: { targetPrice } })
      : await db.watchItem.create({ data: { searchId, email, targetPrice } });
    return NextResponse.json({ ok: true, watch: { id: watch.id, targetPrice: watch.targetPrice } });
  } catch (err) {
    console.error('watch create failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'watch failed' }, { status: 500 });
  }
}
