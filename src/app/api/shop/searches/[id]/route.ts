// GET /api/shop/searches/[id] — re-open a stored analysis (FR-5).
import { NextResponse } from 'next/server';
import { getShopResults } from '@/lib/ta/shop';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const results = await getShopResults(id);
  if (!results) return NextResponse.json({ error: 'search not found' }, { status: 404 });
  return NextResponse.json(results);
}
