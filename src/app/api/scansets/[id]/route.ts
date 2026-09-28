import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { sanitizeFilters } from '@/lib/ta/types';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim().slice(0, 60);
  if (['every_2h', 'every_12h', 'daily', 'weekly', 'manual'].includes(body.schedule)) data.schedule = body.schedule;
  if (typeof body.active === 'boolean') data.active = body.active;
  if (body.filters) data.filtersJson = JSON.stringify(sanitizeFilters(body.filters));

  const scan = await db.scanSet.update({ where: { id }, data });
  return NextResponse.json({ ok: true, scan });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.scanSet.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
