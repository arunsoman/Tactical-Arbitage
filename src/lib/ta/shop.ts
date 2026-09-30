// BuyWise — consumer shopping engine (PRD TA-PRD-SHOP-1.0).
// Where-to-buy comparisons + AI buy-or-wait verdicts for regular shoppers.
// Reuses the platform's data engines (retailer catalog, price-history
// generator) and the LLM registry (SHOP capability, TA-PRD-OPS-1.0).
// The verdict/reasons core is deterministic; a routed SHOP model may enrich
// the narrative prose only (never the verdict — NFR-2).

import { db } from '@/lib/db';
import { BRANDS, RETAILERS, TEMPLATES } from './catalog';
import { generateHistory, rng } from './history';
import { resolveRouting } from './ops';

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface ShopProduct {
  title: string;
  brand: string;
  category: string;
  msrp: number;
  imageUrl: string;
  seed: number;
}

export interface ShopQuote {
  vendor: string;
  vendorType: 'RETAILER' | 'MARKETPLACE';
  tier: string | null;
  price: number;
  shipping: number;
  tax: number;
  total: number;
  listPrice: number;
  discountPct: number;
  inStock: boolean;
  stockLeft: number | null;
  etaDays: number;
  rating: number;
  reviews: number;
  returnDays: number;
  warrantyMonths: number;
  couponText: string | null;
  trendPct: number;
  badges: string[];
  history: { d: string; p: number }[];
}

export interface ShopAnalysis {
  product: ShopProduct;
  quotes: ShopQuote[];
  verdict: 'BUY_NOW' | 'BUY' | 'WAIT';
  confidence: number;
  buyReasons: string[];
  waitReasons: string[];
  narrative: string;
  fairPercentile: number;
  trendPct: number;
  saleInDays: number | null;
  bestVendor: string;
  bestTotal: number;
  worstTotal: number;
  priceLow90: number;
  priceHigh90: number;
}

export interface ShopResultsDTO {
  search: {
    id: string;
    query: string;
    productName: string;
    brand: string;
    category: string;
    imageUrl: string;
    msrp: number;
    verdict: string;
    confidence: number;
    buyReasons: string[];
    waitReasons: string[];
    narrative: string;
    engineLabel: string;
    fairPercentile: number;
    trendPct: number;
    saleInDays: number | null;
    bestVendor: string;
    bestTotal: number;
    worstTotal: number;
    priceLow90: number;
    priceHigh90: number;
    durationMs: number;
    customerEmail: string | null;
    createdAt: string;
  };
  quotes: ShopQuote[];
  watches?: { id: string; email: string; targetPrice: number; createdAt: string }[];
}

export interface ShopSearchSummaryDTO {
  id: string;
  query: string;
  productName: string;
  brand: string;
  category: string;
  imageUrl: string;
  verdict: string;
  confidence: number;
  bestVendor: string;
  bestTotal: number;
  quoteCount: number;
  customerEmail: string | null;
  createdAt: string;
}

// ── FR-1: product resolution (existing listing pool → template synthesis) ──

export async function resolveProduct(query: string): Promise<ShopProduct> {
  const seed = hashSeed(query.toLowerCase().trim());
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  if (tokens.length > 0) {
    const listing = await db.amazonListing.findFirst({
      where: { OR: tokens.map((t) => ({ title: { contains: t } })) },
      orderBy: { bsr: 'asc' },
    });
    if (listing) {
      return { title: listing.title, brand: listing.brand, category: listing.category, msrp: listing.buyBox, imageUrl: listing.imageUrl, seed };
    }
  }
  // deterministic synthesis from the catalog templates (same engine as scans)
  const rand = rng(seed);
  const cats = Object.keys(TEMPLATES);
  const category = cats[Math.floor(rand() * cats.length)];
  const templates = TEMPLATES[category];
  const t = templates[Math.floor(rand() * templates.length)];
  const brandPool = BRANDS[category] ?? [{ name: 'HousePick' }];
  const brand = brandPool[Math.floor(rand() * brandPool.length)];
  const packCount = t.packCounts[Math.floor(rand() * t.packCounts.length)];
  const unitSize = t.unitSizes[Math.floor(rand() * t.unitSizes.length)];
  const pattern = t.patterns[Math.floor(rand() * t.patterns.length)];
  const title = pattern.replace('{n}', brand.name).replace('{p}', String(packCount)).replace('{u}', unitSize);
  const scale = packCount > 1 ? Math.min(1 + (packCount - 1) * 0.55, 1.9) : 1;
  const msrp = round2((t.listPrice[0] + rand() * (t.listPrice[1] - t.listPrice[0])) * scale);
  return { title, brand: brand.name, category, msrp, imageUrl: '', seed };
}

// ── FR-2: vendor comparison assembly (same retailer network as the scanner) ─

const MARKETPLACE_SELLERS = ['TechDeal Direct', 'HomeBright Market', 'PrimeDeal Supply', 'GadgetHut Online', 'ValueCart Trading'];

function vendorSeries(vendor: string, title: string, price: number, stability: number, seedBase: number) {
  const { points } = generateHistory({ currentPrice: price, bsr: 42000, stability, seed: (seedBase ^ hashSeed(vendor + title)) >>> 0 });
  const prices = points.map((p) => p.p);
  const first10 = prices.slice(0, 10).reduce((s, x) => s + x, 0) / 10;
  const last10 = prices.slice(-10).reduce((s, x) => s + x, 0) / 10;
  const trendPct = round2(((last10 - first10) / Math.max(first10, 0.01)) * 100);
  return { history: points.map((p) => ({ d: p.d, p: p.p })), trendPct };
}

export function buildQuotes(product: ShopProduct): ShopQuote[] {
  const rand = rng((product.seed ^ 0x51ab) >>> 0);
  const skewed = shuffle(RETAILERS.filter((r) => r.skew.includes(product.category)), rand);
  const others = shuffle(RETAILERS.filter((r) => !r.skew.includes(product.category)), rand);
  const retailerCount = 6 + Math.floor(rand() * 2);
  const retailers = [...skewed, ...others].slice(0, retailerCount);
  const sellers = shuffle(MARKETPLACE_SELLERS, rand).slice(0, 1 + Math.floor(rand() * 2));

  const quotes: ShopQuote[] = [];
  const pushQuote = (
    vendor: string,
    vendorType: 'RETAILER' | 'MARKETPLACE',
    tier: string | null,
    discountBias: number,
  ) => {
    const qrand = rng((product.seed ^ hashSeed(vendor)) >>> 0);
    const isAmazon = vendor === 'Amazon.com';
    const isMarket = vendorType === 'MARKETPLACE' && !isAmazon;
    let discount = clamp(0.06 + discountBias * 0.26 + qrand() * 0.14, 0.03, 0.4);
    if (isAmazon) discount = clamp(0.08 + qrand() * 0.16, 0.05, 0.26);
    if (isMarket) discount = clamp(0.1 + qrand() * 0.2, 0.06, 0.34);
    let price = round2(product.msrp * (1 - discount));
    let couponText: string | null = null;
    if (qrand() < 0.3) {
      const pct = [3, 5, 8, 10][Math.floor(qrand() * 4)];
      price = round2(price * (1 - pct / 100));
      couponText = `${pct}% coupon applied`;
      discount = clamp(discount + pct / 100, 0, 0.5);
    }
    const freeShipFloor = tier === 'A' || isAmazon ? 35 : tier === 'B' ? 25 : 40;
    let shipping = 0;
    if (!isAmazon) {
      if (isMarket) shipping = price >= 25 && qrand() < 0.4 ? 0 : round2(4.99 + qrand() * 3);
      else shipping = price >= freeShipFloor ? 0 : round2(3.99 + qrand() * 4);
    }
    const tax = round2(price * 0.07);
    const total = round2(price + shipping + tax);
    const stockRoll = qrand();
    const inStock = stockRoll > 0.06;
    const stockLeft = stockRoll > 0.06 && stockRoll < 0.16 ? 2 + Math.floor(qrand() * 8) : null;
    const etaDays = isAmazon ? 1 + Math.floor(qrand() * 2) : isMarket ? 3 + Math.floor(qrand() * 5) : tier === 'A' ? 2 + Math.floor(qrand() * 3) : tier === 'B' ? 3 + Math.floor(qrand() * 4) : 4 + Math.floor(qrand() * 5);
    const rating = isAmazon ? round2(4.3 + qrand() * 0.5) : isMarket ? round2(3.6 + qrand() * 1) : round2(tier === 'A' ? 4.2 + qrand() * 0.6 : 4 + qrand() * 0.7);
    const reviews = isAmazon ? 1200 + Math.floor(qrand() * 24000) : isMarket ? 80 + Math.floor(qrand() * 3900) : tier === 'A' ? 900 + Math.floor(qrand() * 21000) : 250 + Math.floor(qrand() * 8000);
    const returnDays = vendor === 'Costco' || vendor === 'Walmart' ? 90 : isMarket ? 15 + Math.floor(qrand() * 16) : 30;
    const warrantyMonths = product.category === 'Electronics' && qrand() < 0.4 ? 24 : 12;
    const stability = 0.5 + qrand() * 0.45;
    const series = vendorSeries(vendor, product.title, price, stability, product.seed);
    quotes.push({
      vendor, vendorType, tier, price, shipping, tax, total,
      listPrice: product.msrp, discountPct: round2(discount * 100),
      inStock, stockLeft, etaDays, rating, reviews, returnDays, warrantyMonths,
      couponText, trendPct: series.trendPct, badges: [], history: series.history,
    });
  };

  for (const r of retailers) pushQuote(r.name, 'RETAILER', r.tier, r.discountBias);
  pushQuote('Amazon.com', 'MARKETPLACE', null, 0.3);
  for (const s of sellers) pushQuote(s, 'MARKETPLACE', null, 0.35);

  // badges (§6.2): computed, never favoring a featured vendor
  const eligible = quotes.filter((q) => q.inStock);
  if (eligible.length) {
    const minTotal = Math.min(...eligible.map((q) => q.total));
    for (const q of eligible.filter((x) => x.total === minTotal)) q.badges.push('LOWEST_TOTAL');
    const minEta = Math.min(...eligible.map((q) => q.etaDays));
    for (const q of eligible.filter((x) => x.etaDays === minEta)) q.badges.push('FASTEST');
    const maxReturn = Math.max(...eligible.map((q) => q.returnDays));
    for (const q of eligible.filter((x) => x.returnDays === maxReturn)) q.badges.push('BEST_RETURNS');
    for (const q of eligible.filter((x) => x.rating >= 4.6 && x.reviews >= 1000)) q.badges.push('TRUSTED');
  }
  for (const q of quotes) if (q.couponText) q.badges.push('COUPON');
  return quotes;
}

// ── FR-3 / §7: deterministic verdict core with dual reasons ─────────────────

export function buildAnalysis(product: ShopProduct): ShopAnalysis {
  const quotes = buildQuotes(product);
  const rand = rng((product.seed ^ 0xa11ce) >>> 0);
  const { points } = generateHistory({ currentPrice: product.msrp, bsr: 50000, stability: 0.55 + rand() * 0.4, seed: (product.seed ^ 0xbeef) >>> 0 });
  const prices = points.map((p) => p.p);
  const priceLow90 = round2(Math.min(...prices));
  const priceHigh90 = round2(Math.max(...prices));
  const first10 = prices.slice(0, 10).reduce((s, x) => s + x, 0) / 10;
  const last10 = prices.slice(-10).reduce((s, x) => s + x, 0) / 10;
  const trendPct = round2(((last10 - first10) / Math.max(first10, 0.01)) * 100);
  const saleInDays = rand() < 0.55 ? 6 + Math.floor(rand() * 44) : null;

  const eligible = quotes.filter((q) => q.inStock);
  const sorted = [...eligible].sort((a, b) => a.total - b.total);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const fairPercentile = clamp(Math.round(((best.price - priceLow90) / Math.max(priceHigh90 - priceLow90, 0.01)) * 100), 0, 100);
  const savings = round2(worst.total - best.total);
  const savingsPct = Math.round((savings / worst.total) * 100);
  const bandVolatility = (priceHigh90 - priceLow90) / Math.max((priceHigh90 + priceLow90) / 2, 0.01);

  // factor ledger (§7.1) — each vote carries the number it will cite
  let buyW = 0;
  let waitW = 0;
  const buyReasons: string[] = [];
  const waitReasons: string[] = [];

  if (fairPercentile <= 35) { buyW += 2; buyReasons.push(`Today's best price sits in the lowest ${fairPercentile}% of this product's 90-day range ($${priceLow90.toFixed(2)}–$${priceHigh90.toFixed(2)}).`); }
  else if (fairPercentile <= 50) { buyW += 1; buyReasons.push(`The best price is in the cheaper half of its 90-day range (${fairPercentile}th percentile).`); }
  else if (fairPercentile >= 60) { waitW += 2; waitReasons.push(`Today's best price sits in the top ${100 - fairPercentile}% of its 90-day range — historically this dips lower.`); }
  else { waitW += 1; waitReasons.push(`The fair-price meter reads mid-range (${fairPercentile}th percentile of 90 days) — decent, not exceptional.`); }

  if (trendPct <= -3) { waitW += 2; waitReasons.push(`Prices have drifted down ${Math.abs(trendPct).toFixed(1)}% over the last 30 days — the trend is still working in your favor.`); }
  else if (trendPct <= -1.5) { waitW += 1; waitReasons.push(`Prices eased ${Math.abs(trendPct).toFixed(1)}% over the last month; waiting may pay a little more.`); }
  else if (trendPct >= 2) { buyW += 1; buyReasons.push(`Prices are trending up (${trendPct.toFixed(1)}% in 30 days) — locking this in beats chasing a dip that may not come.`); }

  if (saleInDays != null && saleInDays <= 21) { waitW += 2; waitReasons.push(`A seasonal sale window typically opens in about ${saleInDays} days for this category.`); }

  if (best.rating >= 4.5 && best.reviews >= 1000) { buyW += 1; buyReasons.push(`${best.vendor} is a well-trusted seller — ${best.rating.toFixed(1)}★ across ${best.reviews.toLocaleString()} reviews with ${best.returnDays}-day returns.`); }
  if (best.rating < 4.2) { waitW += 1; waitReasons.push(`The cheapest offer comes from a lower-rated seller (${best.rating.toFixed(1)}★) — a better-trusted quote often lands near this price.`); }

  if (best.stockLeft != null && best.stockLeft <= 9) { buyW += 1; buyReasons.push(`Only ${best.stockLeft} units left at the cheapest in-stock vendor — waiting risks the price, not just the stock.`); }
  if (best.couponText) { buyW += 1; buyReasons.push(`A ${best.couponText.replace(' applied', '')} is already reflected in the total at ${best.vendor}.`); }
  if (savingsPct >= 18) { buyW += 1; buyReasons.push(`Vendor spread is wide: buying at ${best.vendor} saves $${savings.toFixed(2)} (${savingsPct}%) vs the priciest quote in this comparison.`); }
  if (bandVolatility > 0.32) { waitW += 1; waitReasons.push(`This product's price swings widely (90-day band is ${Math.round(bandVolatility * 100)}% of its mid price) — patience has historically been rewarded.`); }

  // dual-ledger guarantee (§7.2): both sides always non-empty
  if (buyReasons.length === 0) buyReasons.push(`Even mid-range, the best total of $${best.total.toFixed(2)} undercuts the ${product.brand} reference price by ${Math.round((1 - best.price / product.msrp) * 100)}% — buying today is still reasonable.`);
  if (waitReasons.length === 0) waitReasons.push(`Prices are stable and the fair-price meter reads favorable — waiting saves little and costs you the ${best.etaDays}-day delivery lead time.`);

  const score = buyW - waitW;
  const verdict: ShopAnalysis['verdict'] = score >= 3 ? 'BUY_NOW' : score <= -1 ? 'WAIT' : 'BUY';
  const confidence = Math.round(clamp(62 + quotes.length * 1.5 + Math.min(Math.abs(score) * 6, 18) + (1 - bandVolatility) * 10, 55, 97));

  const verdictSentence = verdict === 'BUY_NOW'
    ? `Our take: buy now — ${best.vendor} at $${best.total.toFixed(2)} total is a genuinely good position in the price band.`
    : verdict === 'WAIT'
      ? `Our take: wait if you can — today's position in the price band argues for patience.`
      : `Our take: reasonable to buy — just know the case for waiting before you do.`;
  const narrative = `We compared ${quotes.length} vendors for the ${product.brand} ${product.category.toLowerCase()} pick. The cheapest in-stock total is $${best.total.toFixed(2)} at ${best.vendor} (with $${best.shipping.toFixed(2)} shipping and $${best.tax.toFixed(2)} estimated tax), saving $${savings.toFixed(2)} (${savingsPct}%) against the priciest quote. ${verdictSentence}`;

  return {
    product, quotes, verdict, confidence, buyReasons, waitReasons, narrative,
    fairPercentile, trendPct, saleInDays, bestVendor: best.vendor, bestTotal: best.total,
    worstTotal: worst.total, priceLow90, priceHigh90,
  };
}

// ── §7.3: SHOP-capable model routing + narrative enrichment ─────────────────

async function routeShopModel(): Promise<{ label: string } | null> {
  const providers = await db.llmProvider.findMany({ where: { status: 'ACTIVE' }, select: { id: true, status: true } });
  const models = await db.llmModel.findMany({
    where: { enabled: true },
    select: { id: true, providerId: true, modelId: true, capabilities: true, tier: true, enabled: true, lastTestStatus: true, provider: { select: { name: true } } },
  });
  const routing = resolveRouting(providers, models);
  const chain = routing.SHOP ?? [];
  if (chain.length === 0) return null;
  const rows = await db.llmModel.findMany({ where: { id: { in: chain.map((c) => c.modelId) } }, include: { provider: { select: { name: true } } } });
  const passing = rows.filter((r) => r.lastTestStatus !== 'FAIL');
  const pick = passing[0] ?? null;
  return pick ? { label: `${pick.modelId} via ${pick.provider.name}` } : null;
}

async function llmNarrate(a: ShopAnalysis): Promise<string | null> {
  try {
    const facts = [
      `Product: ${a.product.brand} ${a.product.title} (${a.product.category}), reference price $${a.product.msrp.toFixed(2)}.`,
      `Vendors compared: ${a.quotes.length}; cheapest in-stock total $${a.bestTotal.toFixed(2)} at ${a.bestVendor}; priciest $${a.worstTotal.toFixed(2)}.`,
      `Fair-price position: ${a.fairPercentile}th percentile of the 90-day range $${a.priceLow90.toFixed(2)}–$${a.priceHigh90.toFixed(2)}.`,
      `30-day trend ${a.trendPct}%; ${a.saleInDays != null ? `seasonal sale in ~${a.saleInDays} days; ` : ''}verdict ${a.verdict} at ${a.confidence}% confidence.`,
      `Buy reasons: ${a.buyReasons.join(' | ')}`,
      `Wait reasons: ${a.waitReasons.join(' | ')}`,
    ].join('\n');
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();
    const run = zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: 'You are BuyWise, a careful shopping advisor. Using ONLY the supplied facts, write 2-3 short sentences of shopper-friendly advice. Never invent prices, ratings, or claims. No markdown.' },
        { role: 'user', content: facts },
      ],
      thinking: { type: 'disabled' },
    });
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 4500));
    const completion = await Promise.race([run, timeout]);
    if (!completion) return null;
    const text = (completion as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content?.trim();
    return text && text.length > 20 ? text.slice(0, 600) : null;
  } catch {
    return null; // graceful fallback to the deterministic narrative (NFR-2)
  }
}

// ── orchestration + persistence ─────────────────────────────────────────────

export async function runShopSearch(query: string, email?: string | null, narrate = true): Promise<ShopResultsDTO> {
  const t0 = Date.now();
  const product = await resolveProduct(query);
  const analysis = buildAnalysis(product);
  const routed = narrate ? await routeShopModel() : null;
  let engineLabel = 'TA Intelligence (built-in)';
  let narrative = analysis.narrative;
  if (routed) {
    const enriched = await llmNarrate(analysis);
    if (enriched) {
      narrative = enriched;
      engineLabel = routed.label;
    }
  }
  const durationMs = Date.now() - t0;

  const search = await db.consumerSearch.create({
    data: {
      query: query.slice(0, 120),
      productName: product.title,
      brand: product.brand,
      category: product.category,
      imageUrl: product.imageUrl,
      msrp: product.msrp,
      verdict: analysis.verdict,
      confidence: analysis.confidence,
      buyReasonsJson: JSON.stringify(analysis.buyReasons),
      waitReasonsJson: JSON.stringify(analysis.waitReasons),
      narrative,
      engineLabel,
      fairPercentile: analysis.fairPercentile,
      trendPct: analysis.trendPct,
      saleInDays: analysis.saleInDays,
      bestVendor: analysis.bestVendor,
      bestTotal: analysis.bestTotal,
      worstTotal: analysis.worstTotal,
      priceLow90: analysis.priceLow90,
      priceHigh90: analysis.priceHigh90,
      durationMs,
      customerEmail: email?.trim() || null,
    },
  });
  for (const q of analysis.quotes) {
    await db.vendorQuote.create({
      data: {
        searchId: search.id, vendor: q.vendor, vendorType: q.vendorType, tier: q.tier,
        price: q.price, shipping: q.shipping, tax: q.tax, total: q.total, listPrice: q.listPrice,
        discountPct: q.discountPct, inStock: q.inStock, stockLeft: q.stockLeft, etaDays: q.etaDays,
        rating: q.rating, reviews: q.reviews, returnDays: q.returnDays, warrantyMonths: q.warrantyMonths,
        couponText: q.couponText, trendPct: q.trendPct,
        badgesJson: JSON.stringify(q.badges), historyJson: JSON.stringify(q.history),
      },
    });
  }
  return toResultsDTO(search, analysis.quotes, []);
}

type SearchRow = Awaited<ReturnType<typeof db.consumerSearch.findUnique>>;

export function toResultsDTO(search: NonNullable<SearchRow>, quotes: ShopQuote[], watches: { id: string; email: string; targetPrice: number; createdAt: Date }[]): ShopResultsDTO {
  return {
    search: {
      id: search.id, query: search.query, productName: search.productName, brand: search.brand,
      category: search.category, imageUrl: search.imageUrl, msrp: search.msrp,
      verdict: search.verdict, confidence: search.confidence,
      buyReasons: JSON.parse(search.buyReasonsJson) as string[],
      waitReasons: JSON.parse(search.waitReasonsJson) as string[],
      narrative: search.narrative, engineLabel: search.engineLabel,
      fairPercentile: search.fairPercentile, trendPct: search.trendPct,
      saleInDays: search.saleInDays, bestVendor: search.bestVendor,
      bestTotal: search.bestTotal, worstTotal: search.worstTotal,
      priceLow90: search.priceLow90, priceHigh90: search.priceHigh90,
      durationMs: search.durationMs, customerEmail: search.customerEmail,
      createdAt: search.createdAt.toISOString(),
    },
    quotes,
    watches: watches.map((w) => ({ ...w, createdAt: w.createdAt.toISOString() })),
  };
}

/** Rehydrate a stored search back into the full results DTO (history re-open). */
export async function getShopResults(id: string): Promise<ShopResultsDTO | null> {
  const search = await db.consumerSearch.findUnique({ where: { id }, include: { quotes: true, watches: true } });
  if (!search) return null;
  const quotes: ShopQuote[] = search.quotes.map((q) => ({
    vendor: q.vendor, vendorType: q.vendorType as ShopQuote['vendorType'], tier: q.tier,
    price: q.price, shipping: q.shipping, tax: q.tax, total: q.total, listPrice: q.listPrice,
    discountPct: q.discountPct, inStock: q.inStock, stockLeft: q.stockLeft, etaDays: q.etaDays,
    rating: q.rating, reviews: q.reviews, returnDays: q.returnDays, warrantyMonths: q.warrantyMonths,
    couponText: q.couponText, trendPct: q.trendPct,
    badges: JSON.parse(q.badgesJson) as string[],
    history: JSON.parse(q.historyJson) as { d: string; p: number }[],
  }));
  return toResultsDTO(search, quotes, search.watches.map((w) => ({ id: w.id, email: w.email, targetPrice: w.targetPrice, createdAt: w.createdAt })));
}
