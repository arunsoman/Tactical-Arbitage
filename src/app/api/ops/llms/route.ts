// LLM provider registry (PRD §5 Module A): create/toggle providers with
// masked-only credential capture, list with models and routing chains.

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { resolveRouting } from '@/lib/ta/ops';

export const dynamic = 'force-dynamic';

const KINDS = ['openai', 'anthropic', 'google', 'custom'];

function maskKey(key: string): string | null {
  const k = key.trim();
  if (!k) return null;
  const last4 = k.slice(-4);
  const prefix = k.slice(0, Math.min(3, k.length));
  return `${prefix}…${last4}`;
}

export async function GET() {
  const [providers, models] = await Promise.all([
    db.llmProvider.findMany({ orderBy: { createdAt: 'asc' } }),
    db.llmModel.findMany({ include: { provider: true }, orderBy: { createdAt: 'asc' } }),
  ]);
  const routing = resolveRouting(
    providers,
    models.map((m) => ({ id: m.id, providerId: m.providerId, capabilities: m.capabilities, tier: m.tier, enabled: m.enabled, modelId: m.modelId })),
  );
  return NextResponse.json({
    providers: providers.map((p) => ({
      id: p.id, name: p.name, kind: p.kind, baseUrl: p.baseUrl, status: p.status,
      keyMasked: p.keyMasked, notes: p.notes, createdAt: p.createdAt,
      models: models
        .filter((m) => m.providerId === p.id)
        .map((m) => ({
          id: m.id, modelId: m.modelId, label: m.label, contextK: m.contextK, costIn: m.costIn, costOut: m.costOut,
          capabilities: JSON.parse(m.capabilities || '[]'), tier: m.tier, enabled: m.enabled,
          lastTestAt: m.lastTestAt, lastTestStatus: m.lastTestStatus, lastLatencyMs: m.lastLatencyMs,
        })),
    })),
    routing,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
    const kind = KINDS.includes(body.kind) ? body.kind : null;
    if (!name || !kind) {
      return NextResponse.json({ error: 'name and a valid kind (openai | anthropic | google | custom) are required' }, { status: 400 });
    }
    const baseUrl = typeof body.baseUrl === 'string' && body.baseUrl.trim() ? body.baseUrl.trim() : null;
    const keyMasked = maskKey(typeof body.apiKey === 'string' ? body.apiKey : '');
    const provider = await db.llmProvider.create({
      data: { name, kind, baseUrl, keyMasked, notes: typeof body.notes === 'string' ? body.notes.slice(0, 300) : null },
    });
    await db.auditEvent.create({
      data: { actor: 'Admin', actorRole: 'SYSTEM', action: 'OPS_PROVIDER_CREATE', targetType: 'llm_provider', targetId: provider.id, detailJson: JSON.stringify({ name, kind, keyCaptured: !!keyMasked }) },
    });
    return NextResponse.json({ ok: true, provider });
  } catch (err) {
    console.error('llm provider create failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'create failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === 'string' ? body.id : '';
    const status = body.status === 'ACTIVE' || body.status === 'DISABLED' ? body.status : null;
    if (!id || !status) return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    const provider = await db.llmProvider.update({ where: { id }, data: { status } });
    // disabling a provider makes all its models ineligible for routing
    if (status === 'DISABLED') {
      await db.llmModel.updateMany({ where: { providerId: id }, data: { enabled: false } });
    }
    await db.auditEvent.create({
      data: { actor: 'Admin', actorRole: 'SYSTEM', action: status === 'ACTIVE' ? 'OPS_PROVIDER_ENABLE' : 'OPS_PROVIDER_DISABLE', targetType: 'llm_provider', targetId: provider.name, detailJson: JSON.stringify({ status }) },
    });
    return NextResponse.json({ ok: true, provider });
  } catch (err) {
    console.error('llm provider patch failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'patch failed' }, { status: 500 });
  }
}
