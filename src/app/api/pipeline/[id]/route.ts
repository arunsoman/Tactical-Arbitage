import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: Record<string, unknown> = {};
  if (typeof body.status === 'string') data.status = body.status;
  if (typeof body.notes === 'string' || body.notes === null) data.notes = body.notes;
  if (Array.isArray(body.tags)) data.tags = JSON.stringify(body.tags);
  if (typeof body.qty === 'number' && body.qty > 0) data.qty = Math.floor(body.qty);
  if (typeof body.owner === 'string') data.owner = body.owner;

  const item = await db.pipelineItem.update({ where: { id }, data });
  return NextResponse.json({ ok: true, item });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.pipelineItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
