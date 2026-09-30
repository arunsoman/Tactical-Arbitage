// Canned responses for the agent composer (PRD §6.3).

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const canned = await db.cannedResponse.findMany({ orderBy: { createdAt: 'asc' } });
  return NextResponse.json({ canned });
}
