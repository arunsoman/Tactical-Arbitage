// Lead engine — turns a matched (retailer SKU × Amazon listing) pair into a
// denormalized Lead row in the deal store. Shared by the seed script and the
// live scan engine so economics are always computed by the same code path.

import { db } from '@/lib/db';
import { computeEconomics, dealScore, riskFlagsFor, FBA_FEES } from './profit';
import { classifySizeTier, round2, round1 } from './profit';
import type { SizeTier } from './types';
import type { AmazonListing, RetailerProduct, Settings } from '@prisma/client';

export interface SettingsLike {
  taxRate: number;
  prepCost: number;
  inboundCost: number;
  minRoi: number; // percent
}

export function settingsLike(s: Settings): SettingsLike {
  return { taxRate: s.taxRate, prepCost: s.prepCost, inboundCost: s.inboundCost, minRoi: s.minRoi };
}

export const RETAILER_SHIPPING_FREE_THRESHOLD = 35;
export const DEFAULT_RETAILER_SHIPPING = 5.99;

/** Retailer shipping heuristic: free above threshold, flat below (per retailer). */
export function retailerShippingFor(price: number): number {
  return price >= RETAILER_SHIPPING_FREE_THRESHOLD ? 0 : round2(DEFAULT_RETAILER_SHIPPING * (price < 15 ? 0.6 : 1));
}

export interface LeadSnapshot {
  ok: boolean;
  reason?: string;
  data?: {
    economics: ReturnType<typeof computeEconomics>;
    flags: string[];
    score: number;
    sizeTier: SizeTier;
    discountPct: number;
  };
}

/**
 * Compute the full lead snapshot for a matched pair.
 * `product.price` is treated as pre-coupon; coupons stack into the effective price (FR-1.4).
 */
export function computeLeadSnapshot(
  product: Pick<RetailerProduct, 'price' | 'couponPct' | 'listPrice'>,
  listing: AmazonListing,
  settings: SettingsLike
): LeadSnapshot {
  const effectivePrice = round2(product.price * (1 - (product.couponPct ?? 0) / 100));
  if (effectivePrice <= 0) return { ok: false, reason: 'invalid price' };

  // listing fields are the source of truth for size/weight
  const d = {
    weightLb: listing.weightLb,
    lengthIn: listing.lengthIn,
    widthIn: listing.widthIn,
    heightIn: listing.heightIn,
  };

  const sizeTier = classifySizeTier(d);
  const economics = computeEconomics({
    category: listing.category,
    buyBox: listing.buyBox,
    retailerPrice: effectivePrice,
    retailerShipping: retailerShippingFor(effectivePrice),
    taxRate: settings.taxRate,
    prepCost: listing.fragile ? Math.max(settings.prepCost, 1.2) : settings.prepCost,
    inboundCost: settings.inboundCost,
    dims: d,
    minRoi: settings.minRoi / 100,
  });

  const flags = riskFlagsFor({
    gated: listing.gated,
    hazmat: listing.hazmat,
    meltable: listing.meltable,
    fragile: listing.fragile,
    ipClaim: listing.ipClaim,
    amazonRetail: listing.amazonRetail,
    sizeTier,
    totalOffers: listing.fbaOffers + listing.fbmOffers,
  });

  const discountPct = listing.listPrice > 0 ? round1((1 - effectivePrice / listing.listPrice) * 100) : 0;
  const score = dealScore({
    roiPct: economics.roiPct,
    netProfit: economics.netProfit,
    bsr: listing.bsr,
    discountPct,
    riskFlags: flags,
  });

  return {
    ok: true,
    data: { economics, flags, score, sizeTier, discountPct },
  };
}

export interface CreateLeadArgs {
  product: RetailerProduct;
  listing: AmazonListing;
  retailer: { id: string; name: string; tier: string };
  settings: SettingsLike;
  method: string;
  confidence: number;
  matchStatus: string;
  priceAgeH: number;
  firstSeenAt?: Date;
}

export async function createLeadFromMatch(args: CreateLeadArgs) {
  const { product, listing, retailer, settings, method, confidence, matchStatus, priceAgeH, firstSeenAt } = args;

  const snap = computeLeadSnapshot(
    { price: product.price, couponPct: product.couponPct, listPrice: product.listPrice },
    listing,
    settings
  );
  if (!snap.ok || !snap.data) return null;
  const { economics, flags, score, sizeTier, discountPct } = snap.data;

  const match = await db.match.create({
    data: {
      retailerProductId: product.id,
      listingId: listing.id,
      method,
      confidence,
      status: matchStatus,
    },
  });

  const now = firstSeenAt ?? new Date();
  const effectivePrice = round2(product.price * (1 - product.couponPct / 100));
  const shipping = round2(retailerShippingFor(effectivePrice));
  const lead = await db.lead.create({
    data: {
      matchId: match.id,
      retailerProductId: product.id,
      listingId: listing.id,
      retailerId: retailer.id,
      retailerName: retailer.name,
      retailerTier: retailer.tier,
      asin: listing.asin,
      title: product.title,
      brand: product.brand,
      category: product.category,
      imageUrl: product.imageUrl,
      retailerPrice: effectivePrice,
      listPrice: product.listPrice,
      couponPct: product.couponPct,
      retailerShipping: shipping,
      buyBox: listing.buyBox,
      referralFee: economics.referralFee,
      fbaFee: economics.fbaFee,
      storageFee: economics.storageFee,
      inboundFee: economics.inboundFee,
      prepFee: economics.prepFee,
      taxFee: economics.taxFee,
      taxRate: economics.taxRate,
      totalCost: economics.totalCost,
      netProfit: economics.netProfit,
      roiPct: economics.roiPct,
      marginPct: economics.marginPct,
      breakeven: economics.breakeven,
      discountPct,
      bsr: listing.bsr,
      fbaOffers: listing.fbaOffers,
      fbmOffers: listing.fbmOffers,
      sizeTier,
      amazonRetail: listing.amazonRetail,
      riskFlags: JSON.stringify(flags),
      score,
      priceAgeH,
      fresh: isFresh(retailer.tier, priceAgeH),
      firstSeenAt: now,
      lastVerifiedAt: now,
    },
  });
  return lead;
}

export function tierSlaHours(tier: string): number {
  if (tier === 'A') return 4;
  if (tier === 'B') return 24;
  return 168;
}

export function isFresh(tier: string, ageH: number): boolean {
  return ageH <= tierSlaHours(tier);
}

export function fbaFeeForTier(tier: SizeTier): number {
  return FBA_FEES[tier];
}
