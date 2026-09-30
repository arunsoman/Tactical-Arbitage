// Immutable audit trail (§5) — append-only log; this route is read-only by design.

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action');
  const events = await db.auditEvent.findMany({
    where: action && action !== 'ALL' ? { action } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return NextResponse.json({ events });
}
