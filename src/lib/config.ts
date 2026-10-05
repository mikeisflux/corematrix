export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "ForeverComicCon";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Booth sizes on the show floor. Prices are the base claim price per size. */
export const BOOTH_SIZES = {
  "6x10": { name: "Artist Alley table", short: "AA table", priceCents: 500, blurb: "A 6-foot table in Artists' Alley. Sketch, sell prints, meet readers.", w: 6, d: 10 },
  "10x10": { name: "Inline booth", short: "10×10", priceCents: 1000, blurb: "The classic 10×10 with a back wall, side drapes and a table.", w: 10, d: 10 },
  "20x10": { name: "Corner booth", short: "20×10", priceCents: 2000, blurb: "Double-wide on a corner: two open sides, twice the banner.", w: 20, d: 10 },
  "20x20": { name: "Island booth", short: "20×20", priceCents: 5000, blurb: "A 20×20 island open on all four sides with a tower sign. The big-publisher spot.", w: 20, d: 20 },
} as const;
export type BoothSize = keyof typeof BOOTH_SIZES;

/** Floor zones multiply the base price. Headliner Row surrounds the arcade in the middle of the hall. */
export const ZONES = {
  artist: { name: "Artists' Alley", mult: 1, blurb: "Tables for individual creators at the east end of the hall." },
  standard: { name: "Show floor", mult: 1, blurb: "Standard aisles across Halls A–H." },
  front: { name: "Front of house", mult: 1.5, blurb: "First spaces off the entrance concourse. Everyone walks past." },
  headliner: { name: "Headliner Row", mult: 2, blurb: "The aisles around the arcade in the middle of the hall. Heaviest foot traffic." },
} as const;
export type Zone = keyof typeof ZONES;

export const BASE_CLAIM_PRICE_CENTS = Number(process.env.BASE_CLAIM_PRICE_CENTS ?? 500);
export const TAKEOVER_MULTIPLIER = Number(process.env.TAKEOVER_MULTIPLIER ?? 1.25);
/** Share of the takeover premium that goes to the seller (rest is platform). */
export const SELLER_PREMIUM_SHARE = Number(process.env.SELLER_PREMIUM_SHARE ?? 0.6);
export const MIN_BOOST_CENTS = 100;
export const REFERRAL_CREDIT_CENTS = 200; // both sides

export const TIERS = {
  free: { name: "Exhibitor", priceCents: 0, perks: ["Permanent booth number", "Logo, banner + link", "Basic stats (7 days)"] },
  pro: {
    name: "Pro",
    priceCents: 900,
    perks: [
      "Full analytics: 90 days, referrers, CTR",
      "Hanging aisle sign + premium banner styles",
      "Weekly email report",
      "Guestbook at your booth",
      "+15% signage height",
    ],
  },
  landmark: {
    name: "Headliner",
    priceCents: 4900,
    perks: [
      "Everything in Pro",
      "Featured in the Headliners strip on the home page",
      "Takeover shield: 7-day notice before any takeover",
      "Ceiling banner slot once a month",
      "+40% signage height and animated marquee",
    ],
  },
} as const;
export type Tier = keyof typeof TIERS;

export const CATEGORIES: Record<string, { name: string; blurb: string; hue: number }> = {
  comics: { name: "Comics", blurb: "Publishers, indie books, back issues.", hue: 215 },
  art: { name: "Art & Illustration", blurb: "Prints, commissions, sketch covers.", hue: 20 },
  toys: { name: "Toys & Collectibles", blurb: "Figures, statues, exclusives.", hue: 45 },
  games: { name: "Games", blurb: "Tabletop, video games, TCGs.", hue: 280 },
  media: { name: "Film & TV", blurb: "Studios, streamers, podcasts.", hue: 340 },
  retail: { name: "Retail", blurb: "Shops, apparel, merch.", hue: 160 },
  fan: { name: "Fan & Community", blurb: "Clubs, cosplay, creators.", hue: 120 },
};

export const BANNER_STYLES = ["classic", "neon", "comic", "minimal", "retro"] as const;

export function takeoverPriceCents(valueCents: number): number {
  return Math.ceil((valueCents * TAKEOVER_MULTIPLIER) / 100) * 100;
}

export function splitTakeover(valueCents: number) {
  const price = takeoverPriceCents(valueCents);
  const premium = price - valueCents;
  const sellerPayout = valueCents + Math.floor(premium * SELLER_PREMIUM_SHARE);
  const platform = price - sellerPayout;
  return { price, premium, sellerPayout, platform };
}

export function formatMoney(cents: number): string {
  const dollars = cents / 100;
  return dollars >= 1000
    ? `$${dollars.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : `$${dollars.toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}

/** Hanging banners (it's indoors). Slot keys are kept short for the DB: "airship" = the entrance banner, "block:N" = a hall's cross-aisle banner. */
export const BILLBOARD_SLOTS = {
  airship: { name: "Entrance banner", blurb: "The 150-foot banner over the main entrance. Every visitor walks in under it.", priceCentsPerWeek: 4900 },
  block: { name: "Cross-aisle banner", blurb: "A hanging banner over the cross aisle in one hall (A–H).", priceCentsPerWeek: 2000 },
} as const;
export const COIN_PACK_KIND = "coins";
