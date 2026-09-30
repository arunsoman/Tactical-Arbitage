// Account health (§5): predictive risk score with visible reasons + suppression
// suggestions. The ranking layer consumes the same computation.

import { NextResponse } from 'next/server';
import { computeAccountHealth } from '@/lib/ta/ai/health';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const health = await computeAccountHealth();
    return NextResponse.json(health);
  } catch (err) {
    console.error('health failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'health failed' }, { status: 500 });
  }
}
