import { sql } from "drizzle-orm";
import { blob, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Registered accounts. Email + password sign-in; login_tokens are one-time password-reset tokens. */
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
  stripeCustomerId: text("stripe_customer_id"), // legacy, unused
  dcPaymentMethodId: text("dc_payment_method_id"), // DivinityCoin saved card for plan renewals
  cardIp: text("card_ip"),
  cardUserAgent: text("card_user_agent"),
  avatar: text("avatar"), // JSON AvatarConfig (body, skin, hair, hairColor, outfit)
  passwordHash: text("password_hash"), // optional: scrypt hash for email+password sign-in (admins, mostly)
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
 * A booth is a fixed space on the convention floor (see src/lib/hall/layout.ts
 * for where every space sits). Booth ids are permanent; the exhibitor in it
 * changes hands. We store the current exhibitor's setup inline.
 */
export const booths = sqliteTable(
  "booths",
  {
    id: integer("id").primaryKey(), // layout index, 1..N
    label: text("label").notNull().default(""), // floor-plan number, e.g. "2329" or "AA-B12"
    size: text("size").notNull().default("10x10"), // 6x10 | 10x10 | 20x10 | 20x20
    kind: text("kind").notNull().default("exhibitor"), // exhibitor | artist
    hall: text("hall").notNull().default("A"), // A..H
    aisle: integer("aisle").notNull().default(100),
    ownerId: text("owner_id"),
    name: text("name"),
    tagline: text("tagline"),
    description: text("description"),
    website: text("website"),
    logoUrl: text("logo_url"),
    color: text("color").notNull().default("#5b8def"),
    accent: text("accent").notNull().default("#ffffff"),
    style: text("style").notNull().default("classic"), // banner style: classic | neon | comic | minimal | retro
    cloth: text("cloth").notNull().default("#111827"), // table cloth / drape color
    category: text("category").notNull().default("comics"), // comics | art | toys | games | publisher | media | retail | fan
    tier: text("tier").notNull().default("free"), // free | pro | landmark
    tierUntil: integer("tier_until"),
    subscriptionId: text("subscription_id"), // stripe sub id, or "sandbox:<txid>"
    subscriptionStatus: text("subscription_status"), // active | canceling | canceled | past_due
    featuredUntil: integer("featured_until"), // season winners get a week on the home page
    lastTakeoverNudgeAt: integer("last_takeover_nudge_at"),
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
  (t) => [index("booths_owner_idx").on(t.ownerId), index("booths_value_idx").on(t.valueCents)],
);

/** Every money movement. amount is what the buyer paid. */
export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    boothId: integer("booth_id").notNull(),
    kind: text("kind").notNull(), // claim | takeover | boost | tier | billboard
    buyerId: text("buyer_id"),
    sellerId: text("seller_id"),
    amountCents: integer("amount_cents").notNull(),
    sellerPayoutCents: integer("seller_payout_cents").notNull().default(0),
    platformCents: integer("platform_cents").notNull().default(0),
    valueBefore: integer("value_before").notNull().default(0),
    valueAfter: integer("value_after").notNull().default(0),
    status: text("status").notNull().default("pending"), // pending | paid | refunded | failed
    provider: text("provider").notNull().default("divinitycoin"), // divinitycoin | sandbox | comp
    providerRef: text("provider_ref"), // DivinityCoin paymentIntentId (pi_…) once paid
    sessionId: text("session_id"), // DivinityCoin checkout session (cs_…)
    customerIp: text("customer_ip"),
    customerUserAgent: text("customer_user_agent"),
    refundedCents: integer("refunded_cents").notNull().default(0),
    notes: text("notes"),
    meta: text("meta"), // JSON: pending booth draft, tier, etc.
    createdAt: integer("created_at").notNull(),
    paidAt: integer("paid_at"),
  },
  (t) => [index("tx_booth_idx").on(t.boothId), index("tx_buyer_idx").on(t.buyerId), index("tx_session_idx").on(t.sessionId), index("tx_status_idx").on(t.status, t.createdAt)],
);

/** Public activity feed. */
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(), // claim | takeover | boost | milestone | tier | rank
    boothId: integer("booth_id"),
    title: text("title").notNull(),
    detail: text("detail"),
    amountCents: integer("amount_cents"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("events_created_idx").on(t.createdAt)],
);

/** Daily rollups per booth: the owner-facing metrics. */
export const boothDaily = sqliteTable(
  "booth_daily",
  {
    boothId: integer("booth_id").notNull(),
    day: text("day").notNull(), // YYYY-MM-DD (UTC)
    impressions: integer("impressions").notNull().default(0), // seen on the floor
    hovers: integer("hovers").notNull().default(0),
    views: integer("views").notNull().default(0), // booth opened
    clicks: integer("clicks").notNull().default(0), // outbound link
    uniques: integer("uniques").notNull().default(0),
    conversions: integer("conversions").notNull().default(0), // owner-reported via pixel
    conversionValueCents: integer("conversion_value_cents").notNull().default(0),
  },
  (t) => [uniqueIndex("booth_daily_pk").on(t.boothId, t.day)],
);

/** Referrer breakdown per booth (where their clicks come from). */
export const boothReferrers = sqliteTable(
  "booth_referrers",
  {
    boothId: integer("booth_id").notNull(),
    source: text("source").notNull(), // map | walk | banner | rankings | directory | share | embed | direct | x.com | ...
    views: integer("views").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
  },
  (t) => [uniqueIndex("booth_ref_pk").on(t.boothId, t.source)],
);

/** Dedupe table for uniques: (booth, day, visitor hash). Pruned nightly. */
export const visitorSeen = sqliteTable(
  "visitor_seen",
  {
    boothId: integer("booth_id").notNull(),
    day: text("day").notNull(),
    visitor: text("visitor").notNull(),
  },
  (t) => [uniqueIndex("visitor_seen_pk").on(t.boothId, t.day, t.visitor)],
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

/** Chat: hall-wide lobby plus per-booth guestbooks. */
export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    room: text("room").notNull(), // "lobby" | "booth:123"
    userId: text("user_id").notNull(),
    authorName: text("author_name").notNull(),
    authorBoothId: integer("author_booth_id"),
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
  closedAt: integer("closed_at"),
  resultsJson: text("results_json"), // SeasonResults, computed at close
});

/** Billboard slots (airship banner, rooftop signs) sold by the week. */
export const billboards = sqliteTable(
  "billboards",
  {
    id: text("id").primaryKey(),
    slot: text("slot").notNull(), // airship | block:N
    ownerId: text("owner_id").notNull(),
    boothId: integer("booth_id"),
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
    boothId: integer("booth_id"),
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
    boothId: integer("booth_id"),
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

/* ───────── Admin: mail, templates, webhooks, audit (ported from the Play Time admin) ───────── */

/** Every email in or out. direction "in" = Inbound Parse; "out" = SendGrid sends (and drafts, status "draft"). */
export const mailMessages = sqliteTable(
  "mail_messages",
  {
    id: text("id").primaryKey(),
    direction: text("direction").notNull(), // in | out
    channel: text("channel").notNull().default("email"), // email | reply | system | contact
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name"),
    toEmail: text("to_email"),
    cc: text("cc"),
    subject: text("subject").notNull(),
    text: text("text"),
    html: text("html"),
    read: integer("read", { mode: "boolean" }).notNull().default(false),
    starred: integer("starred", { mode: "boolean" }).notNull().default(false),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    threadId: text("thread_id"),
    status: text("status"), // queued | sent | delivered | opened | clicked | bounced | spam | failed | draft | received
    statusMessage: text("status_message"),
    sendgridMessageId: text("sendgrid_message_id"),
    templateSlug: text("template_slug"),
    userId: text("user_id"),
    txId: text("tx_id"),
    boothId: integer("booth_id"),
    headers: text("headers"), // JSON
    events: text("events"), // JSON array of SendGrid events
    createdAt: integer("created_at").notNull(),
    sentAt: integer("sent_at"),
  },
  (t) => [index("mail_dir_idx").on(t.direction, t.archived, t.createdAt), index("mail_thread_idx").on(t.threadId), index("mail_to_idx").on(t.toEmail), uniqueIndex("mail_sg_idx").on(t.sendgridMessageId)],
);

export const mailAttachments = sqliteTable(
  "mail_attachments",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    data: blob("data", { mode: "buffer" }).notNull(),
    inline: integer("inline", { mode: "boolean" }).notNull().default(false),
    contentId: text("content_id"),
  },
  (t) => [index("mail_att_msg_idx").on(t.messageId)],
);

export const emailTemplates = sqliteTable("email_templates", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  text: text("text"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const emailTemplateVersions = sqliteTable(
  "email_template_versions",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id").notNull(),
    version: integer("version").notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    text: text("text"),
    changedBy: text("changed_by"),
    changeNote: text("change_note"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("tpl_ver_idx").on(t.templateId, t.version)],
);

/** Every webhook delivery (DivinityCoin, SendGrid) with outcome; failed DivinityCoin events can be re-run from /admin/webhooks. */
export const webhookEvents = sqliteTable(
  "webhook_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(), // divinitycoin | sendgrid
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    payload: text("payload").notNull(), // JSON
    status: text("status").notNull().default("received"), // received | processed | ignored | failed
    error: text("error"),
    receivedAt: integer("received_at").notNull(),
    processedAt: integer("processed_at"),
  },
  (t) => [uniqueIndex("wh_provider_event_idx").on(t.provider, t.eventId), index("wh_received_idx").on(t.provider, t.receivedAt)],
);

export const adminAuditLog = sqliteTable(
  "admin_audit_log",
  {
    id: text("id").primaryKey(),
    adminId: text("admin_id").notNull(),
    adminEmail: text("admin_email"),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    resourceId: text("resource_id"),
    before: text("before"), // JSON
    after: text("after"), // JSON
    ip: text("ip"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("audit_admin_idx").on(t.adminId), index("audit_created_idx").on(t.createdAt)],
);
