// Latency & cost instrumentation (§3 Performance / §5 Latency & Cost).
// Every ranking / reasoning / NL pass records a latency sample; the AI status
// view reports p95 against the PRD budgets (rank < 2s, reasoning < 5s).

import { db } from '@/lib/db';

export type LatencyOp = 'RANK' | 'REASON' | 'NL';

const KEEP_PER_OP = 400; // rolling window for p95 computation

export async function withLatency<T>(op: LatencyOp, fn: () => Promise<T> | T): Promise<{ result: T; ms: number }> {
  const t0 = performance.now();
  const result = await fn();
  const ms = performance.now() - t0;
  try {
    await db.latencySample.create({ data: { op, ms: Math.round(ms * 100) / 100 } });
    // occasional pruning keeps the demo store bounded
    if (Math.random() < 0.1) {
      const samples = await db.latencySample.findMany({
        where: { op },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
        skip: KEEP_PER_OP,
      });
      if (samples.length > 0) {
        await db.latencySample.deleteMany({ where: { id: { in: samples.map((s) => s.id) } } });
      }
    }
  } catch {
    // instrumentation must never break the request path
  }
  return { result, ms };
}

export async function p95For(op: LatencyOp): Promise<{ p95: number; samples: number }> {
  const samples = await db.latencySample.findMany({
    where: { op },
    orderBy: { createdAt: 'desc' },
    take: KEEP_PER_OP,
    select: { ms: true },
  });
  if (samples.length === 0) return { p95: 0, samples: 0 };
  const sorted = samples.map((s) => s.ms).sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return { p95: Math.round(sorted[Math.max(0, idx)] * 10) / 10, samples: sorted.length };
}
