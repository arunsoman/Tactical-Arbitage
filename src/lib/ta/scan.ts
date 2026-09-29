// Scan engine — simulates the distributed crawl → match → calculate pipeline.
// Each run: picks retailers by tier, mints fresh SKUs, runs the simulated
// matcher (GTIN exact + fuzzy fallback), computes economics via the lead
// engine, inserts new deduplicating leads, drifts prices on existing stock,
// and records ScanJobs + ActivityEvents (PRD §7.1, §9).

import { matchesFilters } from './scanAttribution';
import { db } from '@/lib/db';
import { mintScanProduct, generateListings, RETAILERS, type GeneratedListing } from './catalog';
import { createLeadFromMatch, settingsLike, isFresh, tierSlaHours, retailerShippingFor } from './leadEngine';
import { round2, round1, computeEconomics } from './profit';
import { sanitizeFilters, type ScanRunSummary, type LeadFilters } from './types';
import type { Settings } from '@prisma/client';

let listingsCache: GeneratedListing[] | null = null;
function getListings(): GeneratedListing[] {
  if (!listingsCache) listingsCache = generateListings(42, 14);
  return listingsCache;
}

export async function runScan(options: { scanSetId?: string; retailerLimit?: number; retailerIds?: string[] }): Promise<ScanRunSummary> {
  const started = Date.now();
  const settings = (await db.settings.findUnique({ where: { id: 'singleton' } })) ?? (await db.settings.create({ data: { id: 'singleton' } }));
  const s = settingsLike(settings);

  const scanSet = options.scanSetId
    ? await db.scanSet.findUnique({ where: { id: options.scanSetId } })
    : null;
  const scanSetFilters = scanSet ? sanitizeFilters(JSON.parse(scanSet.filtersJson || '{}')) : null;

  // ---- plan jobs: explicit retailers, else healthy retailers first, tier-A priority
  const allRetailers = await db.retailer.findMany({ orderBy: [{ tier: 'asc' }, { name: 'asc' }] });
  const healthy = allRetailers.filter((r) => r.status !== 'blocked');
  let picked: typeof allRetailers;
  if (options.retailerIds && options.retailerIds.length > 0) {
    const idSet = new Set(options.retailerIds);
    picked = allRetailers.filter((r) => idSet.has(r.id));
  } else {
    const limit = Math.min(options.retailerLimit ?? 5, healthy.length);
    const head = healthy.slice(0, 3);
    const rest = healthy.slice(3).sort(() => Math.random() - 0.5);
    picked = [...head, ...rest].slice(0, limit);
  }

  const jobs: ScanRunSummary['jobs'] = [];
  const rand = Math.random;
  let newLeadsTotal = 0;
  let priceUpdatesTotal = 0;
  let errorsTotal = 0;
  let pagesTotal = 0;
  let skusTotal = 0;

  // an expired listing id could crash — resolve ASIN → listing id map once
  const listings = getListings();
  const listingByAsin = new Map<string, GeneratedListing>(listings.map((l) => [l.asin, l]));
  const dbListings = await db.amazonListing.findMany();
  const dbListingByAsin = new Map(dbListings.map((l) => [l.asin, l]));

  for (let i = 0; i < picked.length; i++) {
    const retailer = picked[i];
    const job = await db.scanJob.create({
      data: { retailerId: retailer.id, scanSetId: scanSet?.id ?? null, status: 'RUNNING' },
    });

    // --- simulate crawl
    const pages = 40 + Math.floor(rand() * 260);
    const skus = pages * (12 + Math.floor(rand() * 30));
    let newLeads = 0;
    let priceUpdates = 0;
    let errors = 0;
    const mintCount = 3 + Math.floor(rand() * 9);

    for (let m = 0; m < mintCount; m++) {
      const seed = Date.now() + i * 1000 + m * 77;
      const minted = mintScanProduct(
        getListings(),
        RETAILERS.find((r) => r.domain === retailer.domain)?.skew ?? null,
        scanSetFilters?.categories ?? null,
        seed
      );
      const gen = minted.matchedAsin ? listingByAsin.get(minted.matchedAsin) : null;
      const dbListing = minted.matchedAsin ? dbListingByAsin.get(minted.matchedAsin) : null;
      if (!dbListing) {
        // no match above threshold → recorded as processed SKU without a lead (FR-2.2 <0.85 rejected)
        continue;
      }
      if (minted.matchConfidence < 0.85) continue;

      try {
        // dedupe: same SKU repeated → skip (persistent dedup feed, FR-4.3)
        const existing = await db.retailerProduct.findFirst({
          where: { retailerId: retailer.id, sku: minted.sku },
          include: { match: true },
        });
        if (existing?.match) continue;

        const product = existing
          ? await db.retailerProduct.update({
              where: { id: existing.id },
              data: { price: minted.price, couponPct: minted.couponPct, inStock: true },
            })
          : await db.retailerProduct.create({
              data: {
                retailerId: retailer.id,
                sku: minted.sku,
                title: minted.title,
                brand: minted.brand,
                category: minted.category,
                price: minted.price,
                listPrice: minted.listPrice,
                couponPct: minted.couponPct,
                imageUrl: `cat:${minted.category}|${minted.title.length}|${minted.sku}`,
                upc: minted.upc,
                packCount: minted.packCount,
                unitSize: minted.unitSize,
                inStock: true,
              },
            });

        const matchStatus = minted.matchConfidence >= 0.97 ? 'AUTO_ACCEPTED' : 'REVIEW';
        // REVIEW-queue matches (0.85–0.96) are held for human review — no lead served (FR-2.2)
        if (matchStatus === 'REVIEW') {
          await db.match.create({
            data: { retailerProductId: product.id, listingId: dbListing.id, method: minted.matchMethod, confidence: minted.matchConfidence, status: matchStatus },
          });
          continue;
        }
        const lead = await createLeadFromMatch({
          product,
          listing: dbListing,
          retailer,
          settings: s,
          method: minted.matchMethod,
          confidence: minted.matchConfidence,
          matchStatus,
          priceAgeH: 0.2,
        });
        if (lead) {
          if (scanSet) {
            await db.lead.update({ where: { id: lead.id }, data: { foundByScanId: scanSet.id, foundByScanName: scanSet.name } });
          }
          // same matcher Deal Finder and the scan cards use, so counts always agree
          const relevant = scanSetFilters ? matchesFilters(lead, scanSetFilters, settings) : true;
          if (relevant || !scanSetFilters) newLeads += 1;
        }
      } catch {
        errors += 1;
      }
    }

    // --- price drift on a few existing SKUs from this retailer (FR-1.5 diffing)
    const driftCount = 2 + Math.floor(rand() * 8);
    const existingProducts = await db.retailerProduct.findMany({
      where: { retailerId: retailer.id },
      include: { match: { include: { lead: true, listing: true } } },
      take: 40,
      orderBy: { createdAt: 'desc' },
    });
    for (let dIdx = 0; dIdx < Math.min(driftCount, existingProducts.length); dIdx++) {
      const p = existingProducts[Math.floor(rand() * existingProducts.length)];
      if (!p.match?.lead) continue;
      const drift = 1 + (rand() - 0.62) * 0.14; // slight downward bias (deals get better)
      const newPrice = Math.max(2.5, round2(p.price * drift));
      const newCoupon = rand() < 0.15 ? [5, 10, 15][Math.floor(rand() * 3)] : p.couponPct;
      await db.retailerProduct.update({ where: { id: p.id }, data: { price: newPrice, couponPct: newCoupon } });

      // recompute economics for the lead
      const listing = p.match.listing;
      const { eff, ship } = (() => {
        const effectivePrice = round2(newPrice * (1 - newCoupon / 100));
        return { eff: effectivePrice, ship: retailerShippingFor(effectivePrice) };
      })();
      const econ = computeEconomics({
        category: listing.category,
        buyBox: listing.buyBox,
        retailerPrice: eff,
        retailerShipping: ship,
        taxRate: s.taxRate,
        prepCost: listing.fragile ? Math.max(s.prepCost, 1.2) : s.prepCost,
        inboundCost: s.inboundCost,
        dims: { weightLb: listing.weightLb, lengthIn: listing.lengthIn, widthIn: listing.widthIn, heightIn: listing.heightIn },
        minRoi: s.minRoi / 100,
      });
      const landed = round2(eff + ship + econ.taxFee);
      const roi = landed > 0 ? round2((econ.netProfit / landed) * 100) : 0;
      const discount = listing.listPrice > 0 ? round1((1 - eff / listing.listPrice) * 100) : 0;
      const oldPrice = p.match.lead.retailerPrice;
      await db.lead.update({
        where: { id: p.match.lead.id },
        data: {
          retailerPrice: eff,
          couponPct: newCoupon,
          retailerShipping: ship,
          referralFee: econ.referralFee,
          taxFee: econ.taxFee,
          totalCost: econ.totalCost,
          netProfit: econ.netProfit,
          roiPct: roi,
          marginPct: econ.marginPct,
          breakeven: econ.breakeven,
          discountPct: discount,
          priceAgeH: 0.2,
          fresh: true,
          lastVerifiedAt: new Date(),
        },
      });
      priceUpdates += 1;
      if (newPrice < oldPrice * 0.93) {
        await db.activityEvent.create({
          data: {
            type: 'PRICE_DROP',
            message: `${p.title.slice(0, 48)} dropped ${round1(((oldPrice - newPrice) / oldPrice) * 100)}% at ${retailer.name}`,
            metaJson: JSON.stringify({ leadId: p.match.lead.id, oldPrice, newPrice }),
          },
        });
      }
    }

    // --- freshness aging: leads from this retailer get older (SLA surfaced in UI)
    const tierLeads = await db.lead.findMany({ where: { retailerId: retailer.id }, select: { id: true, priceAgeH: true } });
    for (const l of tierLeads) {
      const ageH = l.priceAgeH + retailer.cadenceHours * (0.2 + rand() * 0.5);
      await db.lead.update({
        where: { id: l.id },
        data: { priceAgeH: round1(ageH), fresh: isFresh(retailer.tier, ageH) },
      });
    }

    // --- retailer health bookkeeping
    const jobErrors = errors;
    const coverageDelta = jobErrors === 0 ? 0.4 : -3.5;
    const newCoverage = Math.max(72, Math.min(100, retailer.coverage + coverageDelta + (rand() - 0.5)));
    const degraded = newCoverage < 88;
    await db.retailer.update({
      where: { id: retailer.id },
      data: {
        lastScanAt: new Date(),
        coverage: round1(newCoverage),
        status: jobErrors > 2 ? 'degraded' : degraded ? 'degraded' : 'healthy',
        avgFreshnessH: round1(Math.max(0.5, tierSlaHours(retailer.tier) * (newCoverage / 100) * 0.6)),
      },
    });

    const finished = new Date();
    await db.scanJob.update({
      where: { id: job.id },
      data: {
        status: errors > 3 ? 'FAILED' : 'DONE',
        pagesCrawled: pages,
        skusProcessed: skus,
        newLeads,
        priceUpdates,
        errors,
        finishedAt: finished,
      },
    });

    jobs.push({
      retailer: retailer.name,
      status: errors > 3 ? 'FAILED' : 'DONE',
      pages,
      skus,
      newLeads,
      priceUpdates,
      errors,
    });
    newLeadsTotal += newLeads;
    priceUpdatesTotal += priceUpdates;
    errorsTotal += errors;
    pagesTotal += pages;
    skusTotal += skus;
  }

  if (scanSet) {
    await db.scanSet.update({ where: { id: scanSet.id }, data: { lastRunAt: new Date(), lastRunStartedAt: new Date(started) } });
  }

  await db.activityEvent.create({
    data: {
      type: 'SCAN',
      message: `Scan cycle complete — ${jobs.length} retailers, ${newLeadsTotal} new leads, ${priceUpdatesTotal} price updates${errorsTotal ? `, ${errorsTotal} errors` : ''}`,
      metaJson: JSON.stringify({ jobs: jobs.length, newLeads: newLeadsTotal }),
    },
  });

  return {
    runId: `run_${started}`,
    jobs,
    totals: {
      jobs: jobs.length,
      pages: pagesTotal,
      skus: skusTotal,
      newLeads: newLeadsTotal,
      priceUpdates: priceUpdatesTotal,
      errors: errorsTotal,
    },
    durationMs: Date.now() - started,
    queuePosition: 0,
  };
}
