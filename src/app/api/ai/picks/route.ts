// AI Picks (§4 US-1/US-2) — GET serves the cached snapshot (<10 min) for instant
// mobile cold starts; POST forces a re-rank (after scans, outcomes, or overrides).

import { NextResponse, type NextRequest } from 'next/server';
import { getPicks } from '@/lib/ta/ai/picks';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get('refresh') === '1';
  try {
    const data = await getPicks({ refresh });
    return NextResponse.json(data);
  } catch (err) {
    console.error('picks failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'picks failed' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const data = await getPicks({ refresh: true });
    return NextResponse.json(data);
  } catch (err) {
    console.error('picks refresh failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'picks refresh failed' }, { status: 500 });
  }
}
