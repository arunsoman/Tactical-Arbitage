// POST /api/shop/search — run a full BuyWise analysis (TA-PRD-SHOP-1.0 FR-1..FR-3).
import { NextResponse, type NextRequest } from 'next/server';
import { runShopSearch } from '@/lib/ta/shop';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = typeof body.query === 'string' ? body.query.trim().slice(0, 120) : '';
    const email = typeof body.email === 'string' ? body.email.trim().slice(0, 120) : null;
    if (!query) return NextResponse.json({ error: 'query is required' }, { status: 400 });
    const results = await runShopSearch(query, email);
    return NextResponse.json(results);
  } catch (err) {
    console.error('shop search failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'search failed' }, { status: 500 });
  }
}
