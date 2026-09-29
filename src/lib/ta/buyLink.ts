// The catalog is synthetic, so there is no real product page to deep-link to. "Buy" opens a
// site-scoped search for the product on the retailer's real domain — the same hand-off a
// seller makes in practice (find the item at the retailer, buy it there, come back to record it).

export function buyUrl(domain: string, title: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${title} site:${domain}`)}`;
}
