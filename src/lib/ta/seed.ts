// Seed — builds the full demo dataset: retailers, Amazon catalog, retailer SKUs,
// simulated matches, ~300 leads priced by the real fee engine, pipeline state,
// saved scans, scan-job history, and activity events.

import { db } from '@/lib/db';
import { RETAILERS, generateListings, generateRetailProducts } from './catalog';
import { generateHistory } from './history';
import { classifySizeTier, referralPctFor, FBA_FEES, round1, round2 } from './profit';
import { createLeadFromMatch, settingsLike, isFresh } from './leadEngine';
import { DEFAULT_FILTERS } from './types';

const HOURS = 3600 * 1000;

export async function seedDatabase() {
  // ---- reset (SQLite: delete in FK-safe order)
  await db.activityEvent.deleteMany();
  await db.scanJob.deleteMany();
  await db.scanSet.deleteMany();
  await db.pipelineItem.deleteMany();
  await db.lead.deleteMany();
  await db.match.deleteMany();
  await db.retailerProduct.deleteMany();
  await db.amazonListing.deleteMany();
  await db.retailer.deleteMany();
  await db.settings.deleteMany();

  // ---- settings singleton (onboarding pending → wizard shows on first load)
  await db.settings.create({
    data: {
      id: 'singleton',
      onboarded: false,
      marketplace: 'US',
      plan: 'PRO',
      trialEndsAt: new Date(Date.now() + 9 * 24 * HOURS),
      sourcingState: 'MT',
      taxRate: 0,
      minRoi: 30,
      minProfit: 5,
      maxBsr: 150000,
      prepCost: 0.5,
      inboundCost: 0.45,
      monthlyBudget: 2500,
      excludedBrands: JSON.stringify([]),
      excludedAsins: JSON.stringify([]),
    },
  });

  // ---- retailers
  const retailerRows = [] as { id: string; name: string; tier: string; idx: number }[];
  const now = Date.now();
  for (let i = 0; i < RETAILERS.length; i++) {
    const spec = RETAILERS[i];
    const degraded = spec.domain === 'boscovs.com'; // one flaky adapter per PRD risk table
    const lastScanAt = new Date(now - (i % 5) * 0.8 * spec.cadenceHours * HOURS - Math.random() * HOURS);
    const coverage = degraded ? round1(76 + Math.random() * 8) : round1(94 + Math.random() * 6);
    const r = await db.retailer.create({
      data: {
        name: spec.name,
        domain: spec.domain,
        tier: spec.tier,
        status: degraded ? 'degraded' : 'healthy',
        cadenceHours: spec.cadenceHours,
        lastScanAt,
        coverage,
        avgFreshnessH: round1(Math.max(0.5, spec.cadenceHours * 0.35 * (coverage / 100))),
        notes: spec.notes ?? null,
      },
    });
    retailerRows.push({ id: r.id, name: r.name, tier: r.tier, idx: i });
  }

  // ---- Amazon catalog with size tiers, fees, Keepa-style history
  const generated = generateListings(42, 20); // 9 categories × 20 = 180 ASINs
  const listingRows = [] as Awaited<ReturnType<typeof db.amazonListing.create>>[];
  for (let i = 0; i < generated.length; i++) {
    const g = generated[i];
    const sizeTier = classifySizeTier({ weightLb: g.weightLb, lengthIn: g.dims.lengthIn, widthIn: g.dims.widthIn, heightIn: g.dims.heightIn });
    // buy box drifts below list on competitive listings
    const buyBox = round2(g.listPrice * (1 - (Math.random() - 0.55) * 0.12));
    const stability = round1(0.55 + Math.random() * 0.44) / 1;
    const hist = generateHistory({
      currentPrice: buyBox,
      bsr: g.bsr,
      stability,
      seed: 1000 + i,
    });
    // rank trend from first vs last week of history
    const firstWk = hist.points.slice(0, 7).reduce((s, p) => s + p.r, 0) / 7;
    const lastWk = hist.points.slice(-7).reduce((s, p) => s + p.r, 0) / 7;
    const rankTrend = lastWk < firstWk * 0.9 ? 'up' : lastWk > firstWk * 1.1 ? 'down' : 'flat';

    const row = await db.amazonListing.create({
      data: {
        asin: g.asin,
        title: g.title,
        brand: g.brand,
        category: g.category,
        imageUrl: `cat:${g.category}|${g.title.length}|${g.asin}`,
        buyBox,
        bsr: g.bsr,
        fbaOffers: g.fbaOffers,
        fbmOffers: g.fbmOffers,
        amazonRetail: g.amazonRetail,
        gated: g.gated,
        hazmat: g.hazmat,
        meltable: g.meltable,
        fragile: g.fragile,
        ipClaim: g.ipClaim,
        sizeTier,
        weightLb: g.weightLb,
        lengthIn: g.dims.lengthIn,
        widthIn: g.dims.widthIn,
        heightIn: g.dims.heightIn,
        referralPct: referralPctFor(g.category, buyBox),
        fbaFee: FBA_FEES[sizeTier],
        monthlyStorage: round2((g.dims.lengthIn * g.dims.widthIn * g.dims.heightIn * 0.78) / 1728),
        keepa30Avg: hist.avg30,
        keepa90Avg: hist.avg90,
        priceStability: stability,
        rankTrend,
        historyJson: JSON.stringify(hist.points),
      },
    });
    listingRows.push(row);
  }
  const listingByAsin = new Map(listingRows.map((l) => [l.asin, l]));
  // fuzzy-match pool: same brand + category (title/attribute fallback per FR-2.2)
  const fuzzyPool = new Map<string, typeof listingRows>();
  for (const l of listingRows) {
    const key = `${l.brand}|${l.category}`;
    const arr = fuzzyPool.get(key) ?? [];
    arr.push(l);
    fuzzyPool.set(key, arr);
  }

  // ---- retailer SKUs + simulated matching (FR-2.1/2.2) — skew-weighted per retailer
  const { products, gtinMap } = generateRetailProducts(generated, RETAILERS, 7, 16);
  const settings = await db.settings.findUnique({ where: { id: 'singleton' } });
  if (!settings) throw new Error('settings missing');
  const s = settingsLike(settings);

  let leadCount = 0;
  const createdLeads: { id: string; firstSeenAt: Date; roiPct: number; netProfit: number; retailerPrice: number; riskFlags: string[] }[] = [];

  for (const p of products) {
    const retailer = retailerRows[p.retailerIdx];
    const matchedAsin = gtinMap.get(p.upc) ?? null;

    // fuzzy-only matches: resolve within same brand+category, or stay unmatched (rejected)
    let method: 'GTIN' | 'FUZZY' | null = matchedAsin ? 'GTIN' : null;
    let confidence = matchedAsin ? 1 : 0;
    let status: 'AUTO_ACCEPTED' | 'REVIEW' | 'REJECTED' = matchedAsin ? 'AUTO_ACCEPTED' : 'REJECTED';
    let resolvedListing = matchedAsin ? listingByAsin.get(matchedAsin) ?? null : null;
    if (!matchedAsin) {
      const roll = Math.random();
      const candidates = fuzzyPool.get(`${p.brand}|${p.category}`) ?? [];
      if (candidates.length > 0 && roll < 0.62) {
        resolvedListing = candidates[Math.floor(Math.random() * candidates.length)];
        method = 'FUZZY';
        if (roll < 0.5) {
          confidence = round2(0.97 + Math.random() * 0.029);
          status = 'AUTO_ACCEPTED';
        } else {
          confidence = round2(0.85 + Math.random() * 0.11);
          status = 'REVIEW';
        }
      }
    }

    const product = await db.retailerProduct.create({
      data: {
        retailerId: retailer.id,
        sku: p.sku,
        title: p.title,
        brand: p.brand,
        category: p.category,
        price: p.price,
        listPrice: p.listPrice,
        couponPct: p.couponPct,
        imageUrl: `cat:${p.category}|${p.title.length}|${p.sku}`,
        upc: p.upc,
        packCount: p.packCount,
        unitSize: p.unitSize,
        inStock: true,
        createdAt: new Date(now - Math.random() * 14 * 24 * HOURS),
      },
    });

    const listing = resolvedListing;
    if (!listing || !method) continue;

    if (status === 'REJECTED') continue;

    // REVIEW-queue matches (0.85–0.96) sit in the review queue — no lead served (FR-2.2)
    if (status === 'REVIEW') {
      await db.match.create({
        data: { retailerProductId: product.id, listingId: listing.id, method, confidence, status },
      });
      continue;
    }

    // spread lead creation over the last 14 days; ~75% within freshness SLA (target ≥95% served fresh)
    const ageDays = Math.random() * 14;
    const firstSeenAt = new Date(now - ageDays * 24 * HOURS);
    const slaH = retailer.tier === 'A' ? 4 : retailer.tier === 'B' ? 24 : 168;
    const freshRoll = Math.random() < 0.78;
    const priceAgeH = freshRoll
      ? round1(Math.random() * slaH * 0.85)
      : round1(slaH * (1.2 + Math.random() * 4));
    const lead = await createLeadFromMatch({
      product,
      listing,
      retailer,
      settings: s,
      method,
      confidence,
      matchStatus: status,
      priceAgeH: priceAgeH,
      firstSeenAt,
    });
    // patch freshness flags post-hoc (age was simulated)
    if (lead) {
      await db.lead.update({
        where: { id: lead.id },
        data: { fresh: isFresh(retailer.tier, priceAgeH), lastVerifiedAt: new Date(now - priceAgeH * HOURS) },
      });
      createdLeads.push({
        id: lead.id,
        firstSeenAt,
        roiPct: lead.roiPct,
        netProfit: lead.netProfit,
        retailerPrice: lead.retailerPrice,
        riskFlags: JSON.parse(lead.riskFlags) as string[],
      });
      leadCount += 1;
    }
  }

  // ---- pipeline state across statuses (FR-7.1)
  // Coherent pipeline: only profitable leads are pursued; anything that has been bought (PURCHASED+)
  // avoids blocking risk flags; WON always made money; LOST is a real loss or a blocked listing.
  const BLOCKING = ['GATED', 'HAZMAT', 'AMAZON_RETAIL', 'IP_CLAIM'];
  const notesByStatus: Record<string, string[]> = {
    INTERESTED: ['Watch for restock — buy box trending up.', 'Checking sell-through before buying.', 'Good ROI — waiting on VA stock check.'],
    PURCHASED: ['VA confirmed stock at store. Order placed.', 'Coupon stacks with clearance — verified at checkout.', 'Ordered sample first, then bulk.'],
    SHIPPED: ['Inbound shipment created, prep done.', 'Sent to FBA — tracking active.', 'Boxed and labeled by VA.'],
    LIVE: ['Listed at Buy Box price, selling steadily.', 'Great seller history on this brand, second reorder.', 'Watch competitors — recheck price weekly.'],
    WON: ['Sold through at target margin — reorder.', 'Sold out in under two weeks, strong repeat buy.', 'Beat projected profit — add to reorder list.'],
    LOST: ['Price crashed after purchase — sold at a loss.', 'Amazon took the Buy Box; units stuck.', 'Listing blocked after purchase — returned to store.'],
  };
  const tagPool = [['high-roi'], ['reorder'], ['H&B'], ['va-sourced'], ['clearance'], ['watch'], ['grocery']];
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
  const clean = (l: (typeof createdLeads)[number]) => !l.riskFlags.some((f) => BLOCKING.includes(f));
  const profitable = createdLeads.filter((l) => l.netProfit >= 4 && l.roiPct >= 20).sort(() => Math.random() - 0.5);
  const losing = createdLeads.filter((l) => l.netProfit < 0 || !clean(l)).sort(() => Math.random() - 0.5);
  const cleanProfitable = profitable.filter(clean);
  const used = new Set<string>();
  const take = (pool: typeof createdLeads) => {
    const l = pool.find((x) => !used.has(x.id));
    if (l) used.add(l.id);
    return l;
  };
  // [status, count, pool, max age in days]
  const plan: [string, number, typeof createdLeads, number][] = [
    ['NEW', 8, profitable, 2],
    ['INTERESTED', 6, profitable, 4],
    ['PURCHASED', 5, cleanProfitable, 6],
    ['SHIPPED', 3, cleanProfitable, 8],
    ['LIVE', 4, cleanProfitable, 10],
    ['WON', 4, cleanProfitable, 14],
    ['LOST', 2, losing, 14],
  ];
  for (const [status, n, pool, maxAgeD] of plan) {
    for (let i = 0; i < n; i++) {
      const l = take(pool);
      if (!l) break;
      // cheaper items are bought in larger quantities
      const qty = l.retailerPrice < 15 ? 6 + Math.floor(Math.random() * 7) : l.retailerPrice < 40 ? 3 + Math.floor(Math.random() * 5) : 1 + Math.floor(Math.random() * 3);
      await db.pipelineItem.create({
        data: {
          leadId: l.id,
          status,
          notes: status === 'NEW' ? null : pick(notesByStatus[status]),
          tags: JSON.stringify(status === 'NEW' ? [] : pick(tagPool)),
          unitCost: ['PURCHASED', 'SHIPPED', 'LIVE', 'WON', 'LOST'].includes(status) ? Math.round(l.retailerPrice * (0.97 + Math.random() * 0.03) * 100) / 100 : null,
          orderNumber: ['PURCHASED', 'SHIPPED', 'LIVE', 'WON', 'LOST'].includes(status) ? `#${100000000 + Math.floor(Math.random() * 899999999)}` : null,
          realizedProfit:
            status === 'WON'
              ? Math.round(l.netProfit * qty * (0.85 + Math.random() * 0.3) * 100) / 100
              : status === 'LOST'
                ? Math.round((l.netProfit < 0 ? l.netProfit : -(2 + Math.random() * 4)) * qty * 100) / 100
                : null,
          expectedProfit: l.netProfit,
          expectedRoi: l.roiPct,
          buyPrice: l.retailerPrice,
          qty: status === 'NEW' || status === 'INTERESTED' ? 1 : qty,
          owner: Math.random() < 0.3 ? 'VA — Priya' : 'Main',
          createdAt: new Date(now - (0.5 + Math.random() * maxAgeD) * 24 * HOURS),
        },
      });
    }
  }

  // ---- saved scans (the 3 onboarding defaults + 1 power-user scan)
  const mkFilters = (over: Partial<typeof DEFAULT_FILTERS>) => JSON.stringify({ ...DEFAULT_FILTERS, minProfit: 5, minRoi: 25, ...over });
  await db.scanSet.create({
    data: { name: 'Clearance Health & Beauty', schedule: 'every_2h', filtersJson: mkFilters({ categories: ['Health & Household', 'Beauty'], minRoi: 30, excludeFlags: ['GATED', 'HAZMAT'] }), active: true, isDefault: true, lastRunAt: new Date(now - 2 * HOURS), lastRunStartedAt: new Date(now - 2 * HOURS) },
  });
  await db.scanSet.create({
    data: { name: 'Toys deal feed', schedule: 'daily', filtersJson: mkFilters({ categories: ['Toys & Games'], minRoi: 25, excludeFlags: ['IP_CLAIM'] }), active: true, isDefault: true, lastRunAt: new Date(now - 6 * HOURS), lastRunStartedAt: new Date(now - 6 * HOURS) },
  });
  await db.scanSet.create({
    data: { name: 'Grocery monthly deals', schedule: 'weekly', filtersJson: mkFilters({ categories: ['Grocery & Gourmet'], minRoi: 20 }), active: true, isDefault: true, lastRunAt: new Date(now - 30 * HOURS), lastRunStartedAt: new Date(now - 30 * HOURS) },
  });
  await db.scanSet.create({
    data: { name: 'High-velocity Tier A sweep', schedule: 'every_12h', filtersJson: mkFilters({ minRoi: 35, minProfit: 8, maxBsr: 80000, excludeFlags: ['GATED', 'HAZMAT', 'AMAZON_RETAIL'] }), active: true, isDefault: false, lastRunAt: new Date(now - 4 * HOURS), lastRunStartedAt: new Date(now - 4 * HOURS) },
  });

  // ---- scan job history (14 days, 3-6 jobs/day)
  const scanSets = await db.scanSet.findMany();
  for (let d = 13; d >= 0; d--) {
    const jobsToday = 3 + Math.floor(Math.random() * 4);
    for (let j = 0; j < jobsToday; j++) {
      const retailer = retailerRows[Math.floor(Math.random() * retailerRows.length)];
      const startedAt = new Date(now - d * 24 * HOURS - Math.random() * 12 * HOURS);
      const failed = Math.random() < 0.06;
      await db.scanJob.create({
        data: {
          retailerId: retailer.id,
          scanSetId: Math.random() < 0.7 ? scanSets[Math.floor(Math.random() * scanSets.length)].id : null,
          status: failed ? 'FAILED' : 'DONE',
          pagesCrawled: 60 + Math.floor(Math.random() * 240),
          skusProcessed: 1200 + Math.floor(Math.random() * 9000),
          newLeads: failed ? 0 : Math.floor(Math.random() * 9),
          priceUpdates: Math.floor(Math.random() * 14),
          errors: failed ? 4 + Math.floor(Math.random() * 8) : Math.floor(Math.random() * 2),
          startedAt,
          finishedAt: new Date(startedAt.getTime() + (90 + Math.random() * 400) * 1000),
        },
      });
    }
  }

  // ---- activity feed
  const events = [
    { type: 'SYSTEM', message: 'Welcome to Tactical Arbitrage — your first scans are running.', ago: 13 * 24 },
    { type: 'DIGEST', message: "Daily digest sent: 42 new deals matched your 'Clearance Health & Beauty' scan.", ago: 1.2 * 24 },
    { type: 'MATCH', message: 'Match correction applied: FUZZY 0.91 → rejected after user flag (flag-to-fix 38h).', ago: 2.1 * 24 },
    { type: 'PIPELINE', message: 'Lead marked PURCHASED — NatureVital Magnesium 6-pack ×6 units.', ago: 2.8 * 24 },
    { type: 'SCAN', message: 'Scan cycle complete — 5 retailers, 7 new leads, 11 price updates.', ago: 3 * 24 },
    { type: 'PRICE_DROP', message: 'PlayForge STEM Blocks dropped 14.2% at ToyCloseouts Direct.', ago: 4.4 * 24 },
    { type: 'SYSTEM', message: 'Retailer "Liquidation Lane" marked degraded — adapter repair scheduled (layout change).', ago: 5.5 * 24 },
  ];
  for (const e of events) {
    await db.activityEvent.create({ data: { type: e.type, message: e.message, createdAt: new Date(now - e.ago * HOURS) } });
  }

  return {
    retailers: retailerRows.length,
    listings: listingRows.length,
    products: products.length,
    leads: leadCount,
  };
}
