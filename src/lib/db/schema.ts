import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Registered owners. Login is passwordless (magic link). */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  handle: text("handle"), // X / social handle, optional
  referralCode: text("referral_code").notNull().unique(),
  referredBy: text("referred_by"),
  creditCents: integer("credit_cents").notNull().default(0), // referral + payout credit
  coins: integer("coins").notNull().default(0), // arcade soft currency
  lastDailyCoinsAt: integer("last_daily_coins_at"),
  streak: integer("streak").notNull().default(0),
  notifyEmail: integer("notify_email", { mode: "boolean" }).notNull().default(true),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  lastSeenAt: integer("last_seen_at"),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const loginTokens = sqliteTable("login_tokens", {
  token: text("token").primaryKey(),
  email: text("email").notNull(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
});

/**
 * A plot is a fixed address on the avenue. Plot numbers are permanent; the
 * building on it changes hands. We store the current building inline.
 */
export const plots = sqliteTable(
  "plots",
  {
    id: integer("id").primaryKey(), // plot number, 1..N
    ownerId: text("owner_id"),
    name: text("name"),
    tagline: text("tagline"),
    description: text("description"),
    website: text("website"),
    logoUrl: text("logo_url"),
    color: text("color").notNull().default("#5b8def"),
    accent: text("accent").notNull().default("#ffffff"),
    style: text("style").notNull().default("modern"), // facade: modern | glass | brick | neon | deco
    shape: text("shape").notNull().default("tower"), // tower | stepped | twin | cantilever | spire
    floors: integer("floors").notNull().default(1),
    roof: text("roof").notNull().default("flat"), // flat | spire | antenna | garden | billboard
    district: text("district").notNull().default("downtown"),
    tier: text("tier").notNull().default("free"), // free | pro | landmark
    tierUntil: integer("tier_until"),
    valueCents: integer("value_cents").notNull().default(0),
    claimedAt: integer("claimed_at"),
    updatedAt: integer("updated_at"),
    lastSoldAt: integer("last_sold_at"),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    notForSaleUntil: integer("not_for_sale_until"), // landmark perk: shield window
    totalViews: integer("total_views").notNull().default(0),
    totalClicks: integer("total_clicks").notNull().default(0),
    totalImpressions: integer("total_impressions").notNull().default(0),
    salesCount: integer("sales_count").notNull().default(0),
  },
  (t) => [index("plots_owner_idx").on(t.ownerId), index("plots_value_idx").on(t.valueCents)],
);

/** Every money movement. amount is what the buyer paid. */
export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    plotId: integer("plot_id").notNull(),
    kind: text("kind").notNull(), // claim | takeover | boost | tier | billboard
    buyerId: text("buyer_id"),
    sellerId: text("seller_id"),
    amountCents: integer("amount_cents").notNull(),
    sellerPayoutCents: integer("seller_payout_cents").notNull().default(0),
    platformCents: integer("platform_cents").notNull().default(0),
    valueBefore: integer("value_before").notNull().default(0),
    valueAfter: integer("value_after").notNull().default(0),
    status: text("status").notNull().default("pending"), // pending | paid | refunded | failed
    provider: text("provider").notNull().default("sandbox"), // sandbox | stripe
    providerRef: text("provider_ref"),
    meta: text("meta"), // JSON: pending building draft, tier, etc.
    createdAt: integer("created_at").notNull(),
    paidAt: integer("paid_at"),
  },
  (t) => [index("tx_plot_idx").on(t.plotId), index("tx_buyer_idx").on(t.buyerId)],
);

/** Public activity feed. */
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(), // claim | takeover | boost | milestone | tier | rank
    plotId: integer("plot_id"),
    title: text("title").notNull(),
    detail: text("detail"),
    amountCents: integer("amount_cents"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("events_created_idx").on(t.createdAt)],
);

/** Daily rollups per plot: the owner-facing metrics. */
export const plotDaily = sqliteTable(
  "plot_daily",
  {
    plotId: integer("plot_id").notNull(),
    day: text("day").notNull(), // YYYY-MM-DD (UTC)
    impressions: integer("impressions").notNull().default(0), // seen on skyline
    hovers: integer("hovers").notNull().default(0),
    views: integer("views").notNull().default(0), // building page opened
    clicks: integer("clicks").notNull().default(0), // outbound link
    uniques: integer("uniques").notNull().default(0),
    conversions: integer("conversions").notNull().default(0), // owner-reported via pixel
    conversionValueCents: integer("conversion_value_cents").notNull().default(0),
  },
  (t) => [uniqueIndex("plot_daily_pk").on(t.plotId, t.day)],
);

/** Referrer breakdown per plot (where their clicks come from). */
export const plotReferrers = sqliteTable(
  "plot_referrers",
  {
    plotId: integer("plot_id").notNull(),
    source: text("source").notNull(), // skyline | rankings | directory | share | embed | direct | x.com | ...
    views: integer("views").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
  },
  (t) => [uniqueIndex("plot_ref_pk").on(t.plotId, t.source)],
);

/** Dedupe table for uniques: (plot, day, visitor hash). Pruned nightly. */
export const visitorSeen = sqliteTable(
  "visitor_seen",
  {
    plotId: integer("plot_id").notNull(),
    day: text("day").notNull(),
    visitor: text("visitor").notNull(),
  },
  (t) => [uniqueIndex("visitor_seen_pk").on(t.plotId, t.day, t.visitor)],
);

/** Site-wide daily KPIs for the operator dashboard. */
export const siteDaily = sqliteTable("site_daily", {
  day: text("day").primaryKey(),
  visits: integer("visits").notNull().default(0),
  uniques: integer("uniques").notNull().default(0),
  claims: integer("claims").notNull().default(0),
  takeovers: integer("takeovers").notNull().default(0),
  boosts: integer("boosts").notNull().default(0),
  revenueCents: integer("revenue_cents").notNull().default(0),
  signups: integer("signups").notNull().default(0),
  outboundClicks: integer("outbound_clicks").notNull().default(0),
  checkoutStarts: integer("checkout_starts").notNull().default(0),
});

/** Chat: avenue-wide lobby plus per-building guestbooks. */
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    room: text("room").notNull(), // "lobby" | "plot:123"
    userId: text("user_id").notNull(),
    authorName: text("author_name").notNull(),
    authorPlotId: integer("author_plot_id"),
    body: text("body").notNull(),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("messages_room_idx").on(t.room, t.createdAt)],
);

/** Weekly seasons: leaderboard snapshots with winners. */
export const seasons = sqliteTable("seasons", {
  id: text("id").primaryKey(), // e.g. 2026-W40
  startsAt: integer("starts_at").notNull(),
  endsAt: integer("ends_at").notNull(),
  resultsJson: text("results_json"), // computed at close
});

/** Billboard slots (airship banner, rooftop signs) sold by the week. */
export const billboards = sqliteTable(
  "billboards",
  {
    id: text("id").primaryKey(),
    slot: text("slot").notNull(), // airship | block:N
    ownerId: text("owner_id").notNull(),
    plotId: integer("plot_id"),
    headline: text("headline").notNull(),
    body: text("body"),
    website: text("website"),
    imageUrl: text("image_url"),
    color: text("color").notNull().default("#111827"),
    startsAt: integer("starts_at").notNull(),
    endsAt: integer("ends_at").notNull(),
    amountCents: integer("amount_cents").notNull(),
    seen: integer("seen").notNull().default(0),
    opens: integer("opens").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    status: text("status").notNull().default("pending"), // pending | active | ended | rejected
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("billboards_slot_idx").on(t.slot, t.endsAt)],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    plotId: integer("plot_id"),
    readAt: integer("read_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("notif_user_idx").on(t.userId, t.createdAt)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull().default(sql`0`),
});

/** Arcade: coin movements and scores. */
export const coinLedger = sqliteTable(
  "coin_ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(), // daily | play | prize | purchase | claim | referral | explore | boost_convert
    ref: text("ref"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("coin_user_idx").on(t.userId, t.createdAt)],
);

export const gameScores = sqliteTable(
  "game_scores",
  {
    id: text("id").primaryKey(),
    gameId: text("game_id").notNull(),
    userId: text("user_id").notNull(),
    playerName: text("player_name").notNull(),
    plotId: integer("plot_id"),
    score: integer("score").notNull(),
    day: text("day").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("scores_game_idx").on(t.gameId, t.score), index("scores_day_idx").on(t.gameId, t.day, t.score)],
);

/** One-time play tokens so scores can't be posted without starting a game. */
export const gamePlays = sqliteTable("game_plays", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  userId: text("user_id").notNull(),
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at"),
});
