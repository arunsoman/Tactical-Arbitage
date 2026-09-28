// Keepa-style 90-day price & rank history generation (FR-4.4 data dependency)

export interface HistoryPoint {
  d: string; // MM-DD
  p: number; // buy box price
  r: number; // BSR
}

export interface HistorySpec {
  currentPrice: number;
  bsr: number;
  stability: number; // 0..1 — 1 = flat, 0 = wild
  seed: number;
  days?: number;
}

/** Deterministic PRNG (mulberry32) so every regeneration is identical. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateHistory(spec: HistorySpec): { points: HistoryPoint[]; avg30: number; avg90: number } {
  const { currentPrice, bsr, stability, seed } = spec;
  const days = spec.days ?? 90;
  const rand = rng(seed);
  const points: HistoryPoint[] = [];
  const today = Date.now();

  // mean-reverting random walk around currentPrice; variance scaled by (1 - stability)
  const volatility = 0.02 + (1 - stability) * 0.16;
  let price = currentPrice * (1 - volatility * (rand() - 0.3));
  let rank = bsr;

  for (let i = days - 1; i >= 0; i--) {
    const shock = (rand() - 0.5) * 2; // -1..1
    price += (currentPrice - price) * 0.08 + currentPrice * volatility * shock * 0.35;
    price = Math.max(currentPrice * 0.55, Math.min(currentPrice * 1.7, price));
    const rankShock = (rand() - 0.5) * 2;
    rank = Math.max(30, Math.round(rank * (1 + 0.05 * rankShock * (1.2 - stability)) + (bsr - rank) * 0.1));
    const d = new Date(today - i * 86400000);
    points.push({
      d: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      p: Math.round(price * 100) / 100,
      r: rank,
    });
  }

  // pin last point to actual current values
  points[points.length - 1] = { d: points[points.length - 1].d, p: currentPrice, r: bsr };

  const last30 = points.slice(-30);
  const avg30 = last30.reduce((s, x) => s + x.p, 0) / last30.length;
  const avg90 = points.reduce((s, x) => s + x.p, 0) / points.length;
  return {
    points,
    avg30: Math.round(avg30 * 100) / 100,
    avg90: Math.round(avg90 * 100) / 100,
  };
}
