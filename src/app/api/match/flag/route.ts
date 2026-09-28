import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Crowdsourced match correction (FR-2.4): flag a bad match → review queue → ML feedback. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const leadId = typeof body.leadId === 'string' ? body.leadId : null;
  const note = typeof body.note === 'string' ? body.note.slice(0, 300) : 'Flagged as wrong product match';
  if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 });

  const lead = await db.lead.findUnique({ where: { id: leadId }, include: { match: true } });
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  await db.match.update({
    where: { id: lead.matchId },
    data: { flagged: true, flagNote: note, status: 'REVIEW' },
  });
  await db.activityEvent.create({
    data: {
      type: 'MATCH',
      message: `Bad match flagged: ${lead.title.slice(0, 50)} → ${lead.asin}. Queued for correction (<72h SLA).`,
      metaJson: JSON.stringify({ leadId }),
    },
  });
  return NextResponse.json({ ok: true });
}
