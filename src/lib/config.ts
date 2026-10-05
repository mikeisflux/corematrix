export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? "AlwaysOnCon";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Total addressable plots. The avenue grows in blocks as they sell out. */
export const TOTAL_PLOTS = 1200;
export const PLOTS_PER_BLOCK = 24; // 12 per side

export const BASE_CLAIM_PRICE_CENTS = Number(process.env.BASE_CLAIM_PRICE_CENTS ?? 500);
/** Price per floor when claiming. Height is the purchase decision. */
export const PRICE_PER_FLOOR_CENTS = BASE_CLAIM_PRICE_CENTS;
export const MAX_FLOORS = 120;

/** Zoning: premium addresses require a minimum height. */
export function zoneFor(plotId: number): { name: string; minFloors: number; blurb: string } {
  if (plotId <= 12) return { name: "Tower zone", minFloors: 50, blurb: "The first block. Zoned for towers of 50 to 120 floors." };
  if (plotId <= 48) return { name: "High street", minFloors: 10, blurb: "Prime frontage. Minimum 10 floors." };
  if (plotId % 100 === 0) return { name: "Corner lot", minFloors: 20, blurb: "A round-number address on a corner. Minimum 20 floors." };
  return { name: "Open zone", minFloors: 1, blurb: "Build anything from a 1-floor shop to a 120-floor tower." };
}
export const TAKEOVER_MULTIPLIER = Number(process.env.TAKEOVER_MULTIPLIER ?? 1.25);
/** Share of the takeover premium that goes to the seller (rest is platform). */
export const SELLER_PREMIUM_SHARE = Number(process.env.SELLER_PREMIUM_SHARE ?? 0.6);
export const MIN_BOOST_CENTS = 100;
export const REFERRAL_CREDIT_CENTS = 200; // both sides

export const TIERS = {
  free: { name: "Owner", priceCents: 0, perks: ["Permanent address", "Logo + link", "Basic stats (7 days)"] },
  pro: {
    name: "Pro",
    priceCents: 900,
    perks: [
      "Full analytics: 90 days, referrers, CTR",
      "Rooftop sign + custom facade styles",
      "Weekly email report",
      "Guestbook on your building",
      "+15% height bonus on the skyline",
    ],
  },
  landmark: {
    name: "Landmark",
    priceCents: 4900,
    perks: [
      "Everything in Pro",
      "Featured in the Landmarks strip on the home page",
      "Takeover shield: 7-day notice before any takeover",
      "Airship banner slot once a month",
      "+40% height bonus and animated spire",
    ],
  },
} as const;
export type Tier = keyof typeof TIERS;

export const DISTRICTS: Record<string, { name: string; blurb: string; hue: number }> = {
  downtown: { name: "Downtown", blurb: "The original avenue. Highest foot traffic.", hue: 215 },
  "crypto-row": { name: "Crypto Row", blurb: "Tokens, DAOs and degens. Loud by design.", hue: 280 },
  "startup-alley": { name: "Startup Alley", blurb: "Products, SaaS and side projects.", hue: 160 },
  "creator-corner": { name: "Creator Corner", blurb: "Streamers, artists, musicians, writers.", hue: 20 },
  "main-street": { name: "Main Street", blurb: "Local businesses and shops.", hue: 45 },
};

export const BUILDING_STYLES = ["modern", "glass", "brick", "neon", "deco"] as const;
export const BUILDING_SHAPES = ["tower", "stepped", "twin", "cantilever", "spire"] as const;
export const ROOF_STYLES = ["flat", "spire", "antenna", "garden", "billboard"] as const;

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

export const BILLBOARD_SLOTS = {
  airship: { name: "Airship banner", blurb: "Flies the whole avenue, always in view.", priceCentsPerWeek: 4900 },
  block: { name: "Block billboard", blurb: "A roadside board at the end of a block.", priceCentsPerWeek: 2000 },
} as const;
export const COIN_PACK_KIND = "coins";
