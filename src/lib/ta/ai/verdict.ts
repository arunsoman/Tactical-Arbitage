// Opportunity verdict — Buy-or-Wait / Avoid (investor-demo AI feature set #3).
//
// Deterministic factor ledger over stored data only — the verdict NEVER depends
// on an LLM (§7.2 principle inherited from the shop verdict engine), and every
// reason cites the exact numbers behind it (§1 evidence-linked). Runs identically
// on the server (picks / NL / assistant payloads) and in the client (detail sheet
// fallback) because it is a pure function.

export interface OpportunityVerdictInput {
  retailerPrice: number; // what the seller pays today
  listPrice: number; // retailer "was" price
  discountPct: number // effective discount vs list
  couponPct: number;
  buyBox: number; // expected Amazon sell price
  netProfit: number;
  roiPct: number;
  breakeven: number;
  bsr: number;
  fbaOffers: number;
  amazonRetail: boolean;
  riskFlags: string[];
  priceAgeH: number;
  fresh: boolean;
  /** 90-day buy-box series (sell side), oldest → newest */
  history: number[];
  minRoi: number;
  estMonthlySales?: number;
}

export type VerdictLabel = 'BUY_NOW' | 'WAIT' | 'AVOID';

export interface OpportunityVerdict {
  verdict: VerdictLabel;
  /** 0..100, deterministic confidence in the verdict itself */
  confidence: number;
  buyReasons: string[];
  waitReasons: string[];
  /** position of the current sell price inside its 90-day range (0 = at the floor) */
  fairPercentile: number;
  priceLow90: number;
  priceHigh90: number;
  /** last-10 vs first-10 of the 90-day series, % */
  trendPct: number;
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function avg(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / Math.max(xs.length, 1);
}

export function buildOpportunityVerdict(input: OpportunityVerdictInput): OpportunityVerdict {
  const hist = (input.history ?? []).filter((p) => Number.isFinite(p) && p > 0);
  const prices = hist.length > 0 ? hist : [input.buyBox];

  const priceLow90 = Math.round(Math.min(...prices, input.buyBox) * 100) / 100;
  const priceHigh90 = Math.round(Math.max(...prices, input.buyBox) * 100) / 100;
  const fairPercentile =
    priceHigh90 - priceLow90 < 0.01 ? 50 : Math.round(Math.max(0, Math.min(100, ((input.buyBox - priceLow90) / (priceHigh90 - priceLow90)) * 100)));
  const first10 = avg(prices.slice(0, 10));
  const last10 = avg(prices.slice(-10));
  const trendPct = Math.round((first10 > 0 ? ((last10 - first10) / first10) * 100 : 0) * 10) / 10;

  const buyReasons: string[] = [];
  const waitReasons: string[] = [];
  let buyW = 0;
  let waitW = 0;

  const flagged = input.riskFlags ?? [];
  const hardFlags = flagged.filter((f) => f === 'GATED' || f === 'IP_CLAIM');
  const softFlags = flagged.filter((f) => f !== 'GATED' && f !== 'IP_CLAIM');
  const avoidable =
    hardFlags.length > 0 ||
    input.netProfit <= 0 ||
    input.roiPct < 8 ||
    (input.amazonRetail && input.roiPct < 15);

  // ---- economics anchor (always cited) ----
  if (input.roiPct >= input.minRoi * 1.4 && input.netProfit >= 10) {
    buyW += 3;
    buyReasons.push(`${money(input.netProfit)} net profit at ${Math.round(input.roiPct)}% ROI — well above your ${Math.round(input.minRoi)}% target with real margin headroom (breakeven ${money(input.breakeven)}).`);
  } else if (input.roiPct >= input.minRoi) {
    buyW += 2;
    buyReasons.push(`${money(input.netProfit)} net at ${Math.round(input.roiPct)}% ROI — clears your ${Math.round(input.minRoi)}% target (breakeven ${money(input.breakeven)}).`);
  } else {
    waitW += 1;
    waitReasons.push(`Economics are thin: ${money(input.netProfit)} net at ${Math.round(input.roiPct)}% ROI vs your ${Math.round(input.minRoi)}% target.`);
  }

  // ---- fair-price meter: where today's sell price sits in its own 90-day range ----
  if (fairPercentile <= 35) {
    buyW += 2;
    buyReasons.push(`Fair-price meter: the buy-box sits at the ${fairPercentile}th percentile of its 90-day range (${money(priceLow90)}–${money(priceHigh90)}) — low in the band, so a normal dip won't wipe the margin.`);
  } else if (fairPercentile <= 55) {
    buyW += 1;
    buyReasons.push(`Fair-price meter: ${fairPercentile}th percentile of its 90-day band (${money(priceLow90)}–${money(priceHigh90)}) — decent position, below mid-range.`);
  } else {
    waitW += 2;
    waitReasons.push(`Fair-price meter: the buy-box sits in the top ${100 - fairPercentile}% of its 90-day range (${money(priceLow90)}–${money(priceHigh90)}) — historically this price dips lower.`);
  }

  // ---- sell-side momentum ----
  if (trendPct >= 2) {
    buyW += 1;
    buyReasons.push(`Sell price trending up ${trendPct.toFixed(1)}% across the recent window — buying now locks a better spread.`);
  } else if (trendPct <= -2) {
    waitW += 2;
    waitReasons.push(`Sell price drifting down ${Math.abs(trendPct).toFixed(1)}% — holding inventory while the price falls compresses profit.`);
  }

  // ---- buy-side price advantage ----
  if (input.discountPct >= 20) {
    buyW += 1;
    buyReasons.push(`Buy price is ${Math.round(input.discountPct)}% below the ${money(input.listPrice)} list price${input.couponPct > 0 ? ` with a ${Math.round(input.couponPct)}% coupon already stacked` : ''}.`);
  } else if (input.couponPct > 0) {
    buyW += 1;
    buyReasons.push(`A ${Math.round(input.couponPct)}% coupon is already priced in.`);
  }

  // ---- demand vs competition signals ----
  if (input.estMonthlySales != null && input.estMonthlySales >= 25) {
    buyW += 1;
    buyReasons.push(`Demand signal: BSR ${input.bsr.toLocaleString('en-US')} — est. ~${input.estMonthlySales} sales/mo you could sell into.`);
  } else if (input.estMonthlySales != null && input.estMonthlySales < 8) {
    waitW += 1;
    waitReasons.push(`Slow mover: BSR ${input.bsr.toLocaleString('en-US')} — est. ~${input.estMonthlySales} sales/mo, capital sits longer.`);
  }
  if (input.fbaOffers <= 5) {
    buyW += 1;
    buyReasons.push(`Competition is light: only ${input.fbaOffers} FBA offers on the listing.`);
  } else if (input.fbaOffers >= 12) {
    waitW += 1;
    waitReasons.push(`Crowded listing: ${input.fbaOffers} FBA offers already competing for the buy box.`);
  }

  // ---- freshness of the number you'd be buying on ----
  if (!input.fresh || input.priceAgeH > 24) {
    waitW += 1;
    waitReasons.push(`Price was last verified ${input.priceAgeH < 24 ? `${Math.round(input.priceAgeH)}h` : `${Math.round(input.priceAgeH / 24)}d`} ago — re-verify at the retailer before committing.`);
  } else if (input.priceAgeH <= 2) {
    buyReasons.push(`Price freshly verified ${input.priceAgeH < 1 ? '<1h' : `${Math.round(input.priceAgeH)}h`} ago.`);
  }

  // ---- structural risks ----
  if (input.amazonRetail) {
    waitW += 2;
    waitReasons.push('Amazon Retail is itself on this listing — buy-box suppression makes any sell-through less predictable.');
  }
  if (softFlags.length > 0) {
    waitW += 1;
    waitReasons.push(`Handling risks flagged: ${softFlags.join(', ').replace(/_/g, ' ').toLowerCase()} — expect FBA restrictions or prep overhead.`);
  }
  if (hardFlags.length > 0) {
    waitReasons.push(`Hard disqualifier: ${hardFlags.map((f) => (f === 'GATED' ? 'the brand is gated' : 'IP-claim history on this brand')).join(' and ')} — selling it would require approval you don't have yet.`);
  }

  // ---- dual-ledger guarantee: both sides always carry at least one claim ----
  if (buyReasons.length === 0) buyReasons.push(`The deal still pencils: buying at ${money(input.retailerPrice)} against a ${money(input.buyBox)} buy box leaves a positive spread, just not an exceptional one.`);
  if (waitReasons.length === 0) waitReasons.push(`Prices are stable in a favorable band and demand holds up — waiting mostly costs you the sales window, not price.`);

  // ---- verdict mapping (deterministic) ----
  const score = buyW - waitW;
  const verdict: VerdictLabel = avoidable ? 'AVOID' : score >= 2 ? 'BUY_NOW' : 'WAIT';

  const evidenceBonus =
    (hist.length >= 60 ? 8 : hist.length >= 30 ? 5 : 2) +
    (input.fresh ? 5 : 0) +
    (input.fbaOffers > 0 ? 2 : 0) +
    (input.roiPct >= input.minRoi ? 3 : 0);
  const confidence = Math.round(
    Math.max(45, Math.min(97, (verdict === 'AVOID' ? 78 : 50) + Math.abs(score) * 5 + evidenceBonus))
  );

  return {
    verdict,
    confidence,
    buyReasons,
    waitReasons,
    fairPercentile,
    priceLow90,
    priceHigh90,
    trendPct,
  };
}

/** Parse a stored listing historyJson ([{d,p,r}]) into a plain price series. */
export function historyPrices(historyJson: string | null | undefined): number[] {
  if (!historyJson) return [];
  try {
    const v = JSON.parse(historyJson);
    return Array.isArray(v) ? v.map((x) => Number(x?.p)).filter((p) => Number.isFinite(p) && p > 0) : [];
  } catch {
    return [];
  }
}