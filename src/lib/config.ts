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
/**
 * Roll-up banner at the booth. Every booth starts with a 3×6 ft banner for the
 * price of the booth; exhibitor booths can pay for a taller one up to 16 ft.
 * Artists' Alley tables are capped at the default. Width follows height (1:2).
 */
export const BANNER = {
  defaultHeight: 6,
  maxHeight: 16,
  artistMaxHeight: 6,
  perFootCents: 200, // one-time, per foot above the default
  heights: [6, 8, 10, 12, 16] as const,
};
/** Banner artwork slots owners can upload to. Sizes are what we store; uploads are fitted to them. */
export const ART_SLOTS = {
  portrait: {
    name: "Roll-up banner",
    ratio: "1:2",
    width: 1200, height: 2400,
    where: "The retractable banner behind your table. 3×6 ft by default; taller upgrades keep the same shape.",
    physical: "Shown 3 ft wide × 6 ft tall by default (200 px per foot); height upgrades scale it up with the same art.",
    tip: "Keep text inside the middle 80% and make headline letters at least 1/15 of the height so they read from the aisle.",
  },
  wide: {
    name: "Wide banner",
    ratio: "4:1",
    width: 2000, height: 500,
    where: "Across the back wall, the header on posts and the hanging sign (all four faces of an island tower).",
    physical: "Stretches the full width of your back wall at 4:1, so it is about 10 × 2.5 ft on a 10×10 and larger on islands.",
    tip: "Logo left or centred, one line of text. Avoid thin strokes: it is seen from 20+ ft away.",
  },
  book: {
    name: "Comic cover",
    ratio: "2:3",
    width: 600, height: 900,
    where: "A comic standing on one of the four stands on your table.",
    physical: "Life size: about 8.5 × 13 in standing on its stand.",
    tip: "Upload the front cover at 2:3. Standard comic covers (6.625 × 10.25 in) fit with a sliver trimmed top and bottom.",
  },
  drape: {
    name: "Table drape",
    ratio: "3:1",
    width: 1800, height: 600,
    where: "Hangs on the outside front of the table skirt only (never the top or sides), centred on your cloth colour, on every table in your booth.",
    physical: "About 5.7 × 1.9 ft on a 6 ft table and 6.3 × 2.1 ft on an 8 ft table, roughly 300 px per foot. The skirt is only 2.2 ft tall, so the art is as wide as the table allows and never taller than the skirt.",
    tip: "A logo on a transparent PNG works best: it is fitted and centred, never cropped. Anything you upload is scaled to fit inside 3:1.",
  },
  tower: {
    name: "Tower wrap",
    ratio: "2:7",
    width: 800, height: 2800,
    where: "Wraps all four faces of your island tower from the plinth to the cap, replacing the fabric, the banner band and the logo board.",
    physical: "8 ft wide × 28 ft tall on the premier booth (100 px per foot); other islands show the same art on their shorter tower.",
    tip: "Design one face; it repeats on all four. The roll-up banners stand in front of the lower part of each face (the bottom 16 ft on the premier booth), so put the hero art in the top half.",
  },
  floor: {
    name: "Floor graphic",
    ratio: "1:1",
    width: 2000, height: 2000,
    where: "Printed on the carpet of your 20×20 island, under the tower, tables and roll-ups.",
    physical: "The full 20 × 20 ft of your island (100 px per foot). The tower covers the middle 8 × 8 ft and the tables sit 2 ft inside each edge.",
    tip: "Big shapes and a bold border read best from the aisle; fine text on the floor is unreadable at avatar height.",
  },
} as const;
export type ArtSlot = keyof typeof ART_SLOTS;
/** Slots that only exist on a 20×20 island (it has the tower and the open floor). */
export const ISLAND_SLOTS: readonly ArtSlot[] = ["tower", "floor"];
/** Art slot keys stored per booth: a slot name, or "book:N" for the Nth comic stand. */
export const bookSlotKey = (n: number) => `book:${n}`;
export const specForSlot = (key: string) => (key.startsWith("book:") ? ART_SLOTS.book : (ART_SLOTS as Record<string, (typeof ART_SLOTS)[ArtSlot]>)[key]);
/** "Display a book": $5 per stand, one-time. Four stands per table, so capacity follows the table count. */
export const BOOK_PRICE_CENTS = 500;
export function bookCapacity(size: string, kind: string): number {
  // four comic stands per table: one table for artists and 10x10s, two for a 20x10, four for an island
  if (kind === "artist") return 4;
  if (size === "20x20") return 16;
  if (size === "20x10") return 8;
  return 4;
}
export const ART_MAX_UPLOAD = 12 * 1024 * 1024;
export const ART_FORMATS = "PNG, JPG, WebP or PDF (first page)";

/** The house booth: the first 20×20 island inside the main entrance (label 1702), owned by the superadmin. */
export const HOUSE_BOOTH_ID = 442;
export const bannerWidth = (height: number) => Math.round((height / 2) * 10) / 10;
export const bannerUpgradeCents = (from: number, to: number) => Math.max(0, to - from) * BANNER.perFootCents;
export const REFERRAL_CREDIT_CENTS = 200; // both sides
/** Cash-outs: credit → PayPal, paid by hand from Admin → Payouts. */
export const PAYOUT_MIN_CENTS = 2500;
export const PAYOUT_MAX_CENTS = 500000;

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
