// Model enrollment & config (PRD FR-A3/A7): register under a provider with
// capability tags and routing tier; enable/disable and price edits take
// effect on the next routing resolution without restart.

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const CAPS = ['RANK', 'REASON', 'NL', 'EVAL'];
const TIERS = ['PRIMARY', 'FALLBACK'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const providerId = typeof body.providerId === 'string' ? body.providerId : '';
    const modelId = typeof body.modelId === 'string' ? body.modelId.trim().slice(0, 80) : '';
    const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 80) : modelId;
    if (!providerId || !modelId) return NextResponse.json({ error: 'providerId and modelId are required' }, { status: 400 });

    const provider = await db.llmProvider.findUnique({ where: { id: providerId } });
    if (!provider) return NextResponse.json({ error: 'provider not found' }, { status: 404 });
    if (provider.status === 'DISABLED') return NextResponse.json({ error: 'provider is disabled — enable it before enrolling models' }, { status: 422 });

    const capabilities = Array.isArray(body.capabilities) ? body.capabilities.filter((c: string) => CAPS.includes(c)) : [];
    if (!capabilities.length) return NextResponse.json({ error: 'at least one capability (RANK/REASON/NL/EVAL) is required' }, { status: 400 });

    const exists = await db.llmModel.findUnique({ where: { providerId_modelId: { providerId, modelId } } });
    if (exists) return NextResponse.json({ error: 'that model id is already enrolled for this provider' }, { status: 409 });

    const model = await db.llmModel.create({
      data: {
        providerId,
        modelId,
        label,
        contextK: Number.isFinite(body.contextK) ? Math.max(1, Math.min(2000, Math.round(body.contextK))) : 128,
        costIn: Number.isFinite(body.costIn) ? Math.max(0, body.costIn) : 0,
        costOut: Number.isFinite(body.costOut) ? Math.max(0, body.costOut) : 0,
        capabilities: JSON.stringify(capabilities),
        tier: TIERS.includes(body.tier) ? body.tier : 'FALLBACK',
        enabled: body.enabled === true,
      },
    });
    await db.auditEvent.create({
      data: { actor: 'Admin', actorRole: 'SYSTEM', action: 'OPS_MODEL_ENROLL', targetType: 'llm_model', targetId: `${provider.name}/${modelId}`, detailJson: JSON.stringify({ capabilities, tier: model.tier }) },
    });
    return NextResponse.json({ ok: true, model });
  } catch (err) {
    console.error('llm model create failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'create failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const current = await db.llmModel.findUnique({ where: { id }, include: { provider: true } });
    if (!current) return NextResponse.json({ error: 'model not found' }, { status: 404 });

    // PRIMARY requires a passing test (PRD §5.3)
    if (body.tier === 'PRIMARY' && (!current.lastTestAt || current.lastTestStatus !== 'PASS')) {
      return NextResponse.json({ error: 'a model must pass a connection test before serving as PRIMARY — run the test first' }, { status: 422 });
    }

    const data: Record<string, unknown> = {};
    if (Array.isArray(body.capabilities)) {
      const caps = body.capabilities.filter((c: string) => CAPS.includes(c));
      if (!caps.length) return NextResponse.json({ error: 'at least one capability is required' }, { status: 400 });
      data.capabilities = JSON.stringify(caps);
    }
    if (TIERS.includes(body.tier)) data.tier = body.tier;
    if (typeof body.enabled === 'boolean') {
      if (body.enabled && current.provider.status === 'DISABLED') {
        return NextResponse.json({ error: 'provider is disabled — enable the provider first' }, { status: 422 });
      }
      data.enabled = body.enabled;
    }
    if (Number.isFinite(body.costIn)) data.costIn = Math.max(0, body.costIn);
    if (Number.isFinite(body.costOut)) data.costOut = Math.max(0, body.costOut);

    const model = await db.llmModel.update({ where: { id }, data });
    await db.auditEvent.create({
      data: { actor: 'Admin', actorRole: 'SYSTEM', action: 'OPS_MODEL_UPDATE', targetType: 'llm_model', targetId: `${current.provider.name}/${current.modelId}`, detailJson: JSON.stringify(data) },
    });
    return NextResponse.json({ ok: true, model });
  } catch (err) {
    console.error('llm model patch failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'patch failed' }, { status: 500 });
  }
}
