/**
 * The economy: claiming, takeovers, boosts and tiers. Every path creates a
 * transaction row first (pending), then `settle()` applies it once payment
 * is confirmed (comp/credit: immediately; DivinityCoin: from the webhook).
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { MIN_BOOST_CENTS, TIERS, type Tier, formatMoney, CATEGORIES, BANNER_STYLES, BOOTH_SIZES, ZONES, BANNER, bannerUpgradeCents, HOUSE_BOOTH_ID, isHouseBooth, BOOK_PRICE_CENTS, bookCapacity, takeoverSplitFor } from "@/lib/config";
import { clampStr, isHexColor, newId, normalizeUrl, now } from "@/lib/util";
import { publish } from "@/lib/realtime";
import { bumpSiteDaily } from "@/lib/analytics";
import { BILLBOARD_SLOTS } from "@/lib/config";
import { boothSpace, hallLayout, totalBooths, describeSpace } from "@/lib/hall/layout";
import { activatePlan } from "@/lib/subscriptions";
import { sendReceipt, sendSold, sendWelcome } from "@/lib/emails";
import { sendTemplate } from "@/lib/sendgrid";
import { notify } from "@/lib/notify";

export type Booth = typeof schema.booths.$inferSelect;

/** Changes only when what /api/logo serves changes (the logo, or the name and colour its initials fallback uses), not on
 *  every value bump: each change makes every viewer download the logo again. */
export function logoStamp(p: Pick<Booth, "logoUrl" | "name" | "color">): number {
  const s = `${p.logoUrl ?? ""}|${p.name ?? ""}|${p.color ?? ""}`;
  let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}
export function liveBooth(p: Booth, art?: Record<string, number>, artLinks?: Record<string, string>) {
  return { art, artLinks, house: isHouseBooth(p.id), bannerHeight: p.bannerHeight, bookSlots: p.bookSlots, logoVersion: logoStamp(p), freeValueCents: p.freeValueCents, id: p.id, valueCents: p.valueCents, name: p.name, color: p.color, accent: p.accent, style: p.style, cloth: p.cloth, category: p.category, tier: p.tier, hasLogo: !!p.logoUrl, tagline: p.tagline, website: p.website, artstation: p.artstation, deviantart: p.deviantart, instagram: p.instagram, xUrl: p.xUrl, facebook: p.facebook, globalcomix: p.globalcomix, size: p.size, kind: p.kind, label: p.label, hall: p.hall };
}
export type Tx = typeof schema.transactions.$inferSelect;

export interface BoothDraft {
  name: string;
  tagline?: string;
  description?: string;
  website?: string;
  artstation?: string;
  deviantart?: string;
  instagram?: string;
  xUrl?: string;
  facebook?: string;
  globalcomix?: string;
  logoUrl?: string;
  color?: string;
  accent?: string;
  style?: string; // banner style
  cloth?: string; // table cloth / drape color
  category?: string;
}

/** A full URL or a bare handle ("@mike", "mike") for a profile site; empty stays empty. */
function profileUrl(v: string | undefined, base: string): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return normalizeUrl(s) ?? null;
  const handle = s.replace(/^@/, "").replace(/[^a-z0-9_.\-]/gi, "").slice(0, 60);
  return handle ? base + handle : null;
}

const badLogo = (msg: string): never => { throw new Error(msg); };
/** Cleared fields come back as null (so an edit really removes them); fields not given come back undefined. */
export function sanitizeDraft(d: Partial<BoothDraft>): BoothDraft {
  const name = clampStr(d.name, 40);
  if (!name) throw new Error("Give your booth a name");
  const website = normalizeUrl(d.website);
  // logos: a static image path on this site, an uploaded raster data URL (what /api/upload returns), or a remote http(s)
  // URL. Not any local path: /logo/<id> redirects there for every visitor, so "/api/px/42?v=..." or "/app/go/42" would turn
  // each logo load into a fake conversion or click. SVG is refused: an SVG served from our origin can run script.
  const raw = d.logoUrl;
  const logo = raw === undefined ? undefined : !raw ? null
    : /^\/(?!\/)[A-Za-z0-9_\-/]+\.(png|jpe?g|webp|gif)$/i.test(raw) && !raw.includes("..") ? raw
    : /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(raw) && raw.length < 1_500_000 ? raw
    : raw.startsWith("data:") ? badLogo("Use a PNG, JPG, WebP or GIF logo (SVG isn't supported).")
    : raw.startsWith("/") ? badLogo("A logo path on this site must point to a PNG, JPG, WebP or GIF file.")
    : normalizeUrl(raw) ?? badLogo("That logo link isn't a web address.");
  return {
    name,
    tagline: (clampStr(d.tagline, 90) ?? null) as string | undefined,
    description: (clampStr(d.description, 600) ?? null) as string | undefined,
    website: (website ?? null) as string | undefined,
    artstation: (profileUrl(d.artstation, "https://www.artstation.com/") ?? null) as string | undefined,
    deviantart: (profileUrl(d.deviantart, "https://www.deviantart.com/") ?? null) as string | undefined,
    instagram: (profileUrl(d.instagram, "https://www.instagram.com/") ?? null) as string | undefined,
    xUrl: (profileUrl(d.xUrl, "https://x.com/") ?? null) as string | undefined,
    facebook: (profileUrl(d.facebook, "https://www.facebook.com/") ?? null) as string | undefined,
    globalcomix: (profileUrl(d.globalcomix, "https://globalcomix.com/a/") ?? null) as string | undefined,
    logoUrl: logo as string | undefined,
    color: d.color && isHexColor(d.color) ? d.color : "#5b8def",
    accent: d.accent && isHexColor(d.accent) ? d.accent : "#ffffff",
    style: BANNER_STYLES.includes((d.style ?? "") as never) ? d.style : "classic",
    cloth: d.cloth && isHexColor(d.cloth) ? d.cloth : "#111827",
    category: d.category && CATEGORIES[d.category] ? d.category : "comics",
  };
}

/** Layout columns copied onto a booth row so lists and admin pages don't need the layout. */
export function spaceColumns(boothId: number) {
  const s = boothSpace(boothId);
  if (!s) throw new Error("No such booth");
  return { label: s.label, size: s.size, kind: s.kind, hall: s.hall, aisle: s.aisle };
}

/** A booth as the public may see it: one an admin has hidden reads as not there. */
export async function getPublicBooth(id: number): Promise<Booth | null> {
  const p = await getBooth(id);
  return p && !p.hidden ? p : null;
}
export async function getBooth(id: number): Promise<Booth | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null; // /app/booth/abc and friends: no such booth, not a crashed query
  await ensureMigrated();
  const [p] = await db.select().from(schema.booths).where(eq(schema.booths.id, id)).limit(1);
  return p ?? null;
}

export async function claimedBooths(): Promise<Booth[]> {
  await ensureMigrated();
  return db
    .select()
    .from(schema.booths)
    .where(and(sql`${schema.booths.ownerId} IS NOT NULL`, eq(schema.booths.hidden, false)))
    .orderBy(schema.booths.id);
}

/** Lowest unclaimed booth id, or null if sold out. */
export async function nextAvailableBooth(): Promise<number | null> {
  const [first] = await availableBooths(1);
  return first ?? null;
}

export async function availableBooths(limit = 60, size?: string): Promise<number[]> {
  await ensureMigrated();
  const rows = await db.select({ id: schema.booths.id }).from(schema.booths).where(sql`${schema.booths.ownerId} IS NOT NULL`);
  const taken = new Set(rows.map((r) => r.id));
  const out: number[] = [];
  for (const b of hallLayout()) {
    if (out.length >= limit) break;
    if (taken.has(b.id)) continue;
    if (size && b.size !== size) continue;
    out.push(b.id);
  }
  return out;
}

/** Claim price comes from the space: size × zone multiplier. */
export function claimPriceCents(boothId: number): number {
  const s = boothSpace(boothId);
  if (!s) throw new Error("No such booth");
  return s.priceCents;
}
export const TOTAL_BOOTHS = totalBooths();
export { BOOTH_SIZES, ZONES };

const HOLD_MS = 10 * 60_000;

/** A booth with a pending claim by someone else in the last 10 minutes is held. */
async function heldByOther(boothId: number, buyerId: string): Promise<boolean> {
  const [h] = await db
    .select({ id: schema.transactions.id })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.boothId, boothId),
        eq(schema.transactions.kind, "claim"),
        eq(schema.transactions.status, "pending"),
        sql`${schema.transactions.buyerId} != ${buyerId}`,
        sql`${schema.transactions.createdAt} > ${now() - HOLD_MS}`,
      ),
    )
    .limit(1);
  return !!h;
}

export async function startClaim(boothId: number, buyerId: string, draft: BoothDraft, creditCents: number, code?: string | null) {
  await ensureMigrated();
  sanitizeDraft(draft); // a draft settle would refuse (blank name...) is refused now, before anything is charged or used up
  if (!boothSpace(boothId)) throw new Error("No such booth");
  const p = await getBooth(boothId);
  if (p?.ownerId) throw new Error("That booth is already claimed. Try a takeover instead.");
  if (await heldByOther(boothId, buyerId)) throw new Error("Someone is checking out this booth right now. Try again in a few minutes or pick another.");
  const price = claimPriceCents(boothId);
  // a booth code covers the whole price; it is counted as used when the claim settles
  const codeRow = code ? await checkBoothCode(code, boothId) : null;
  if (codeRow) {
    const [mine] = await db.select({ id: schema.codeRedemptions.id }).from(schema.codeRedemptions).where(and(eq(schema.codeRedemptions.codeId, codeRow.id), eq(schema.codeRedemptions.userId, buyerId))).limit(1);
    if (mine) throw new Error("You've already used this booth code. Each code is one booth per person.");
  }
  const credit = codeRow ? 0 : Math.min(creditCents, price);
  const tx: typeof schema.transactions.$inferInsert = {
    id: newId(),
    boothId,
    kind: "claim",
    buyerId,
    amountCents: codeRow ? 0 : price - credit,
    platformCents: codeRow ? 0 : price - credit,
    valueBefore: 0,
    valueAfter: price,
    status: "pending",
    meta: JSON.stringify({ draft, creditUsed: credit, codeId: codeRow?.id, code: codeRow?.code }),
    createdAt: now(),
  };
  await db.insert(schema.transactions).values(tx);
  await bumpSiteDaily({ checkoutStarts: 1 });
  return tx as Tx;
}

export async function startTakeover(boothId: number, buyerId: string, draft: BoothDraft, creditCents: number) {
  await ensureMigrated();
  sanitizeDraft(draft); // refuse an unusable draft before charging, not after

  const p = await getBooth(boothId);
  if (!p?.ownerId) throw new Error("That booth is unclaimed. Claim it instead.");
  if (p.ownerId === buyerId) throw new Error("You already own this booth. Boost it instead.");
  if (isHouseBooth(boothId)) throw new Error("This is the show's own booth. It is never for sale.");
  if (p.notForSaleUntil && p.notForSaleUntil > now()) throw new Error("This Headliner booth is shielded for a few more days.");
  // the seller is paid only for the part of the booth they paid for: value they got free stays with the show
  const { price, sellerPayout, platform } = takeoverSplitFor(p.valueCents, p.freeValueCents);
  const credit = Math.min(creditCents, Math.max(0, price - sellerPayout));
  const tx: typeof schema.transactions.$inferInsert = {
    id: newId(),
    boothId,
    kind: "takeover",
    buyerId,
    sellerId: p.ownerId,
    amountCents: price - credit,
    sellerPayoutCents: sellerPayout,
    platformCents: platform - credit,
    valueBefore: p.valueCents,
    valueAfter: price,
    status: "pending",
    meta: JSON.stringify({ draft, creditUsed: credit, previousName: p.name, freeBefore: p.freeValueCents }),
    createdAt: now(),
  };
  await db.insert(schema.transactions).values(tx);
  await bumpSiteDaily({ checkoutStarts: 1 });
  return tx as Tx;
}

export async function startBoost(boothId: number, buyerId: string, amountCents: number) {
  await ensureMigrated();
  const p = await getBooth(boothId);
  if (!p?.ownerId || p.ownerId !== buyerId) throw new Error("You can only boost a booth you own");
  if (!Number.isFinite(amountCents) || amountCents < MIN_BOOST_CENTS) throw new Error(`Minimum boost is ${formatMoney(MIN_BOOST_CENTS)}`);
  const amt = Math.round(amountCents);
  const tx: typeof schema.transactions.$inferInsert = {
    id: newId(),
    boothId,
    kind: "boost",
    buyerId,
    amountCents: amt,
    platformCents: amt,
    valueBefore: p.valueCents,
    valueAfter: p.valueCents + amt,
    status: "pending",
    createdAt: now(),
  };
  await db.insert(schema.transactions).values(tx);
  await bumpSiteDaily({ checkoutStarts: 1 });
  return tx as Tx;
}

/** A taller roll-up banner: one-time, priced per foot above the default; the spend also counts toward booth value. */
export async function startBannerHeight(boothId: number, buyerId: string, height: number) {
  await ensureMigrated();
  const p = await getBooth(boothId);
  if (!p?.ownerId || p.ownerId !== buyerId) throw new Error("You can only upgrade a booth you own");
  const max = p.kind === "artist" ? BANNER.artistMaxHeight : p.size === "20x20" ? BANNER.islandMaxHeight : BANNER.maxHeight;
  if (!(BANNER.heights as readonly number[]).includes(height) || height > max) throw new Error(p.kind === "artist" ? `Artists' Alley banners are capped at ${BANNER.artistMaxHeight} ft` : p.size === "20x20" ? `Island roll-ups are capped at ${BANNER.islandMaxHeight} ft` : `Banners go up to ${BANNER.maxHeight} ft`);
  if (height <= p.bannerHeight) throw new Error(`Your banner is already ${p.bannerHeight} ft`);
  const amt = bannerUpgradeCents(p.bannerHeight, height);
  const tx: typeof schema.transactions.$inferInsert = {
    id: newId(),
    boothId,
    kind: "banner",
    buyerId,
    amountCents: amt,
    platformCents: amt,
    valueBefore: p.valueCents,
    valueAfter: p.valueCents + amt,
    status: "pending",
    meta: JSON.stringify({ height, from: p.bannerHeight }),
    createdAt: now(),
  };
  await db.insert(schema.transactions).values(tx);
  await bumpSiteDaily({ checkoutStarts: 1 });
  return tx as Tx;
}

/** "Display a book": unlock platforms on the table for standing comic covers, $5 each, one-time; the spend counts toward value. */
export async function startBooks(boothId: number, buyerId: string, qty: number) {
  await ensureMigrated();
  const p = await getBooth(boothId);
  if (!p?.ownerId || p.ownerId !== buyerId) throw new Error("You can only add books to a booth you own");
  const cap = bookCapacity(p.size, p.kind);
  const n = Math.max(1, Math.min(Math.round(qty), cap - p.bookSlots));
  if (p.bookSlots >= cap) throw new Error(`All ${cap} platforms on your table are already unlocked`);
  const amt = n * BOOK_PRICE_CENTS;
  const tx: typeof schema.transactions.$inferInsert = {
    id: newId(), boothId, kind: "book", buyerId, amountCents: amt, platformCents: amt,
    valueBefore: p.valueCents, valueAfter: p.valueCents + amt, status: "pending",
    meta: JSON.stringify({ qty: n }), createdAt: now(),
  };
  await db.insert(schema.transactions).values(tx);
  await bumpSiteDaily({ checkoutStarts: 1 });
  return tx as Tx;
}

export async function startTier(boothId: number, buyerId: string, tier: Tier) {
  await ensureMigrated();
  const p = await getBooth(boothId);
  if (!p?.ownerId || p.ownerId !== buyerId) throw new Error("You can only upgrade a booth you own");
  if (tier === "free") throw new Error("Pick a paid tier");
  const price = TIERS[tier].priceCents;
  const tx: typeof schema.transactions.$inferInsert = {
    id: newId(),
    boothId,
    kind: "tier",
    buyerId,
    amountCents: price,
    platformCents: price,
    valueBefore: p.valueCents,
    valueAfter: p.valueCents,
    status: "pending",
    meta: JSON.stringify({ tier }),
    createdAt: now(),
  };
  await db.insert(schema.transactions).values(tx);
  await bumpSiteDaily({ checkoutStarts: 1 });
  return tx as Tx;
}

export async function startCoinPack(buyerId: string, packId: string, packs: ReadonlyArray<{ id: string; coins: number; priceCents: number }>) {
  await ensureMigrated();
  const pack = packs.find((p) => p.id === packId);
  if (!pack) throw new Error("Unknown pack");
  const tx: typeof schema.transactions.$inferInsert = {
    id: newId(),
    boothId: 0,
    kind: "coins",
    buyerId,
    amountCents: pack.priceCents,
    platformCents: pack.priceCents,
    status: "pending",
    meta: JSON.stringify({ coins: pack.coins, packId }),
    createdAt: now(),
  };
  await db.insert(schema.transactions).values(tx);
  await bumpSiteDaily({ checkoutStarts: 1 });
  return tx as Tx;
}

export interface BillboardDraft {
  slot: "airship" | "block";
  block?: number;
  weeks: number;
  headline: string;
  body?: string;
  website?: string;
  imageUrl?: string;
  color?: string;
  boothId?: number | null;
}

export async function startBillboard(buyerId: string, d: BillboardDraft) {
  await ensureMigrated();
  const weeks = Math.min(8, Math.max(1, Math.floor(d.weeks || 1)));
  const headline = clampStr(d.headline, 48);
  if (!headline) throw new Error("Add a headline");
  const slotKey = d.slot === "airship" ? "airship" : `block:${Math.max(0, Math.floor(d.block ?? 0))}`;
  // a billboard may point at the buyer's own booth only
  const linked = d.boothId ? await getBooth(Number(d.boothId)) : null;
  const boothRef = linked && linked.ownerId === buyerId ? linked.id : null;
  const price = (d.slot === "airship" ? BILLBOARD_SLOTS.airship.priceCentsPerWeek : BILLBOARD_SLOTS.block.priceCentsPerWeek) * weeks;
  // Find the next free window for that slot.
  const [last] = await db
    .select({ endsAt: sql<number>`max(${schema.billboards.endsAt})` })
    .from(schema.billboards)
    .where(and(eq(schema.billboards.slot, slotKey), sql`${schema.billboards.status} IN ('pending','active')`));
  const startsAt = Math.max(now(), Number(last?.endsAt ?? 0));
  const draft = {
    slot: slotKey,
    headline,
    body: clampStr(d.body, 140),
    website: normalizeUrl(d.website) ?? undefined,
    imageUrl: d.imageUrl && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(d.imageUrl) ? d.imageUrl : normalizeUrl(d.imageUrl) ?? undefined,
    color: d.color && isHexColor(d.color) ? d.color : "#111827",
    boothId: boothRef,
    startsAt,
    endsAt: startsAt + weeks * 7 * 86_400_000,
    weeks,
  };
  const tx: typeof schema.transactions.$inferInsert = {
    id: newId(),
    boothId: boothRef ?? 0,
    kind: "billboard",
    buyerId,
    amountCents: price,
    platformCents: price,
    status: "pending",
    meta: JSON.stringify({ billboard: draft }),
    createdAt: now(),
  };
  await db.insert(schema.transactions).values(tx);
  await bumpSiteDaily({ checkoutStarts: 1 });
  return { tx: tx as Tx, startsAt, price };
}

/** Apply a paid transaction. Safe to call twice (second call is a no-op). */
export type PayProvider = "divinitycoin" | "comp" | "sandbox";

export async function settle(txId: string, provider: PayProvider, providerRef?: string): Promise<Tx | null> {
  try { return await settleInner(txId, provider, providerRef); }
  catch (e) {
    const [tx] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, txId)).limit(1);
    if (e instanceof SettleConflict) return tx ? flagForRefund(tx, e.message) : null;
    // anything else after the payment was recorded: keep a trail an admin will see, rather than a paid order with no outcome
    if (tx?.status === "paid") {
      const note = `SETTLE ERROR, check whether it applied: ${(e as Error).message}`.slice(0, 500);
      await db.update(schema.transactions).set({ notes: tx.notes ? `${tx.notes}\n${note}` : note }).where(eq(schema.transactions.id, tx.id)).catch(() => {});
      const { recordError } = await import("@/lib/sentinel");
      await recordError({ kind: "server", where: "settle", message: `Transaction ${tx.id} (${tx.kind}) paid but settle threw: ${(e as Error).message}`, url: `/admin/transactions/${tx.id}` }).catch(() => {});
    }
    throw e;
  }
}
async function settleInner(txId: string, provider: PayProvider, providerRef?: string): Promise<Tx | null> {
  await ensureMigrated();
  const [tx] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, txId)).limit(1);
  if (!tx) return null;
  if (tx.status === "paid") return tx;
  if (tx.status !== "pending") return tx;
  const meta = tx.meta
    ? (JSON.parse(tx.meta) as {
        draft?: BoothDraft;
        creditUsed?: number;
        codeId?: string;
        tier?: Tier;
        previousName?: string;
        coins?: number;
        billboard?: { slot: string; headline: string; body?: string; website?: string; imageUrl?: string; color: string; boothId: number | null; startsAt: number; endsAt: number };
      })
    : {};
  const t = now();

  // Mark paid first so a retry can't double-apply.
  const updated = await db
    .update(schema.transactions)
    .set({ status: "paid", provider, providerRef: providerRef ?? null, paidAt: t })
    .where(and(eq(schema.transactions.id, txId), eq(schema.transactions.status, "pending")))
    .returning();
  if (!updated.length) return tx;

  // Whatever was true when checkout started may not be true now (another buyer got there first, the code was used, the
  // credit was spent). Check, and consume codes and credit atomically, before anything is granted. On a conflict the
  // payment stays recorded as paid, nothing is applied, and it is flagged for a refund.
  const conflict = await claimInputs(tx, meta);
  if (conflict) return flagForRefund(updated[0], conflict);
  // the part of this purchase that wasn't paid for: a booth code or an admin comp covers it all; referral credit covers
  // what it paid. A later takeover pays the owner only for the rest.
  const promoUsed = Number((await db.select({ m: schema.transactions.meta }).from(schema.transactions).where(eq(schema.transactions.id, tx.id)).limit(1)).map((r) => (r.m ? JSON.parse(r.m).promoUsed : 0))[0] ?? 0) || 0;
  const freeValue = meta.codeId || provider === "comp" ? tx.valueAfter : Math.min(promoUsed, tx.valueAfter);

  if (tx.kind === "claim" && meta.draft) {
    const d = sanitizeDraft(meta.draft);
    await db
      .insert(schema.booths)
      .values({
        id: tx.boothId,
        ...spaceColumns(tx.boothId),
        ownerId: tx.buyerId,
        ...d,
        valueCents: tx.valueAfter,
        freeValueCents: freeValue,
        claimedAt: t,
        updatedAt: t,
        lastSoldAt: t,
        salesCount: 1,
      })
      .onConflictDoUpdate({
        target: schema.booths.id,
        set: { ...spaceColumns(tx.boothId), ownerId: tx.buyerId, ...d, valueCents: tx.valueAfter, freeValueCents: freeValue, claimedAt: t, updatedAt: t, lastSoldAt: t, salesCount: 1, hidden: false, teamId: null },
        setWhere: isNull(schema.booths.ownerId), // never over someone who claimed it in the meantime
      })
      .returning({ id: schema.booths.id })
      .then(async (rows) => { if (!rows.length) { await releaseInputs(tx, meta); throw new SettleConflict("Someone else claimed this booth first."); } });
    await addEvent("claim", tx.boothId, `${d.name} is on the show floor`, `${describeSpace(boothSpace(tx.boothId)!)} · ${CATEGORIES[d.category ?? "comics"].name}`, tx.valueAfter);
    await bumpSiteDaily({ claims: 1, revenueCents: tx.amountCents });
    if (meta.codeId && tx.buyerId) {
      await db.insert(schema.codeRedemptions).values({ id: newId(), codeId: meta.codeId, userId: tx.buyerId, boothId: tx.boothId, txId: tx.id, createdAt: t });
    }
    if (tx.buyerId) {
      await db.update(schema.users).set({ coins: sql`${schema.users.coins} + 50` }).where(eq(schema.users.id, tx.buyerId));
      await db.insert(schema.coinLedger).values({ id: newId(), userId: tx.buyerId, delta: 50, reason: "claim", ref: `booth:${tx.boothId}`, createdAt: t });
      await sendWelcome(tx.buyerId, tx.boothId, d.name);
      await notify(tx.buyerId, "claim", `${d.name} is on the show floor`, `Booth ${describeSpace(boothSpace(tx.boothId)!)} is yours. +50 coins. Upload your banner and comics from the dashboard.`, tx.boothId);
    }
  } else if (tx.kind === "takeover" && meta.draft) {
    const d = sanitizeDraft(meta.draft);
    const prev = await getBooth(tx.boothId);
    await db
      .update(schema.booths)
      .set({
        ownerId: tx.buyerId,
        ...d,
        valueCents: tx.valueAfter,
        updatedAt: t,
        lastSoldAt: t,
        tier: "free",
        tierUntil: null,
        subscriptionId: null,
        subscriptionStatus: null,
        featuredUntil: null,
        notForSaleUntil: null,
        teamId: null, // the old owner's crew doesn't come with the booth
        freeValueCents: freeValue, // the new owner paid for it (less any referral credit they used)
        salesCount: sql`${schema.booths.salesCount} + 1`,
      })
      .where(and(eq(schema.booths.id, tx.boothId), tx.sellerId ? eq(schema.booths.ownerId, tx.sellerId) : sql`1`, eq(schema.booths.valueCents, tx.valueBefore)))
      .returning({ id: schema.booths.id })
      .then(async (rows) => { if (!rows.length) { await releaseInputs(tx, meta); throw new SettleConflict("The booth changed hands or value before this payment landed."); } });
    if (tx.sellerId) {
      await db
        .update(schema.users)
        .set({ creditCents: sql`${schema.users.creditCents} + ${tx.sellerPayoutCents}` })
        .where(eq(schema.users.id, tx.sellerId));
      const freeBefore = Number((meta as { freeBefore?: number }).freeBefore ?? 0) || 0;
      await notify(tx.sellerId, "sold", `${prev?.name ?? "Your booth"} was bought out`, tx.sellerPayoutCents <= 0
        ? `Booth ${prev?.label ?? tx.boothId} sold for ${formatMoney(tx.valueAfter)}. It came to you free (a booth code or a gift from the show), so the sale goes to the show; nothing is added to your balance.`
        : `Booth ${prev?.label ?? tx.boothId} sold for ${formatMoney(tx.valueAfter)}. ${formatMoney(tx.sellerPayoutCents)} was added to your balance${freeBefore > 0 ? ` (paid on the part of the booth you paid for; the part you got free stays with the show)` : ` (${formatMoney(tx.sellerPayoutCents - tx.valueBefore)} profit)`}.`, tx.boothId);
      if (tx.sellerPayoutCents > 0) await sendSold(tx.sellerId, tx.boothId, prev?.name ?? "Your booth", tx.valueAfter, tx.sellerPayoutCents, tx.valueBefore);
    }
    await addEvent("takeover", tx.boothId, `${d.name} took over booth ${prev?.label ?? tx.boothId}`, `Bought ${meta.previousName ?? "the space"} for ${formatMoney(tx.valueAfter)}`, tx.valueAfter);
    await notify(tx.buyerId, "takeover", `Booth ${prev?.label ?? tx.boothId} is yours`, `You took over ${meta.previousName ?? "the space"} for ${formatMoney(tx.valueAfter)}. Set up your banner and comics from the dashboard.`, tx.boothId);
    await bumpSiteDaily({ takeovers: 1, revenueCents: tx.amountCents });
  } else if (tx.kind === "boost") {
    const [p] = await db
      .update(schema.booths)
      .set({ valueCents: sql`${schema.booths.valueCents} + ${tx.amountCents}`, ...(provider === "comp" ? { freeValueCents: sql`${schema.booths.freeValueCents} + ${tx.amountCents}` } : {}), updatedAt: t })
      .where(eq(schema.booths.id, tx.boothId))
      .returning();
    await addEvent("boost", tx.boothId, `${p?.name ?? "A booth"} upgraded its signage`, `+${formatMoney(tx.amountCents)} in value · now ${formatMoney(p?.valueCents ?? 0)}`, tx.amountCents);
    await notify(tx.buyerId, "boost", `${p?.name ?? "Your booth"} upgraded its signage`, `+${formatMoney(tx.amountCents)} in value · now worth ${formatMoney(p?.valueCents ?? 0)}.`, tx.boothId);
    await bumpSiteDaily({ boosts: 1, revenueCents: tx.amountCents });
  } else if (tx.kind === "banner") {
    const height = Number((meta as { height?: number }).height) || BANNER.defaultHeight;
    const [p] = await db
      .update(schema.booths)
      .set({ bannerHeight: height, valueCents: sql`${schema.booths.valueCents} + ${tx.amountCents}`, ...(provider === "comp" ? { freeValueCents: sql`${schema.booths.freeValueCents} + ${tx.amountCents}` } : {}), updatedAt: t })
      .where(and(eq(schema.booths.id, tx.boothId), sql`${schema.booths.bannerHeight} < ${height}`)) // two upgrades settling out of order can't shrink it
      .returning();
    if (!p) { await releaseInputs(tx, meta); throw new SettleConflict("The banner is already this tall or taller (another upgrade landed first)."); }
    await addEvent("boost", tx.boothId, `${p?.name ?? "A booth"} raised its banner to ${height} ft`, `+${formatMoney(tx.amountCents)} in value · now ${formatMoney(p?.valueCents ?? 0)}`, tx.amountCents);
    await notify(tx.buyerId, "boost", `Your banner is now ${height} ft tall`, `${p?.name ?? "Your booth"}: +${formatMoney(tx.amountCents)} in value · now worth ${formatMoney(p?.valueCents ?? 0)}.`, tx.boothId);
    await bumpSiteDaily({ boosts: 1, revenueCents: tx.amountCents });
  } else if (tx.kind === "book") {
    const qty = Math.max(1, Number((meta as { qty?: number }).qty) || 1);
    const cur = await getBooth(tx.boothId);
    const cap = cur ? bookCapacity(cur.size, cur.kind) : 3;
    const [p] = await db
      .update(schema.booths)
      .set({ bookSlots: sql`${schema.booths.bookSlots} + ${qty}`, valueCents: sql`${schema.booths.valueCents} + ${tx.amountCents}`, ...(provider === "comp" ? { freeValueCents: sql`${schema.booths.freeValueCents} + ${tx.amountCents}` } : {}), updatedAt: t })
      .where(and(eq(schema.booths.id, tx.boothId), sql`${schema.booths.bookSlots} + ${qty} <= ${cap}`)) // never charge for stands the table can't hold
      .returning();
    if (!p) { await releaseInputs(tx, meta); throw new SettleConflict("The table is already full of comic stands (another purchase landed first)."); }
    await addEvent("boost", tx.boothId, `${p?.name ?? "A booth"} put ${qty} ${qty === 1 ? "book" : "books"} on display`, `+${formatMoney(tx.amountCents)} in value · now ${formatMoney(p?.valueCents ?? 0)}`, tx.amountCents);
    await notify(tx.buyerId, "boost", `${qty} more comic ${qty === 1 ? "stand" : "stands"} on your table`, `${p?.name ?? "Your booth"} now shows ${p?.bookSlots ?? qty} covers. Upload them from the dashboard.`, tx.boothId);
    await bumpSiteDaily({ boosts: 1, revenueCents: tx.amountCents });
  } else if (tx.kind === "tier" && meta.tier) {
    const pm = (meta as { paymentMethodId?: string }).paymentMethodId ?? null;
    // only an admin comp is free; a card payment never becomes a comp, even if the card id is missing here
    const p = await activatePlan(tx.boothId, meta.tier, provider === "comp" ? null : pm, provider === "comp");
    await addEvent("tier", tx.boothId, `${p?.name ?? "A booth"} is now a ${TIERS[meta.tier].name}`, meta.tier === "landmark" ? "Featured in the hall, takeover shield on" : "Unlocked full analytics", tx.amountCents);
    await bumpSiteDaily({ revenueCents: tx.amountCents });
    await notify(tx.buyerId, "plan", `${p?.name ?? "Your booth"} is now a ${TIERS[meta.tier].name}`, meta.tier === "landmark" ? "Featured in the hall with the takeover shield on. Renews every 30 days." : "Full analytics unlocked. Renews every 30 days.", tx.boothId);
    if (tx.buyerId) {
      const [u] = await db.select({ email: schema.users.email, notify: schema.users.notifyEmail, name: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, tx.buyerId));
      if (u?.notify) {
        await sendTemplate("plan_started", u.email, { subject: `${p?.name ?? `#${tx.boothId}`} is now a ${TIERS[meta.tier].name}`, fallbackText: `Your ${TIERS[meta.tier].name} plan is active. Renews every 30 days; cancel any time from the dashboard.`, name: u.name ?? u.email, boothName: p?.name ?? `#${tx.boothId}`, planName: TIERS[meta.tier].name, amount: formatMoney(tx.amountCents), perks: TIERS[meta.tier].perks.join(" · "), boothId: tx.boothId }, { userId: tx.buyerId, boothId: tx.boothId, txId: tx.id, channel: "system" });
      }
    }
  }

  if (tx.kind === "coins" && meta.coins && tx.buyerId) {
    await db.update(schema.users).set({ coins: sql`${schema.users.coins} + ${meta.coins}` }).where(eq(schema.users.id, tx.buyerId));
    await db.insert(schema.coinLedger).values({ id: newId(), userId: tx.buyerId, delta: meta.coins, reason: "purchase", ref: tx.id, createdAt: t });
    await bumpSiteDaily({ revenueCents: tx.amountCents });
    await notify(tx.buyerId, "coins", `+${meta.coins} coins`, "They're in your wallet. Head to the arcade.").catch(() => {});
  } else if (tx.kind === "billboard" && meta.billboard && tx.buyerId) {
    const b = meta.billboard;
    // the slot's next free window is decided now, not at checkout: two people buying the same slot queue one after the other
    const [last] = await db.select({ endsAt: sql<number>`max(${schema.billboards.endsAt})` }).from(schema.billboards)
      .where(and(eq(schema.billboards.slot, b.slot), sql`${schema.billboards.status} IN ('pending','active')`));
    const startsAt = Math.max(t, Number(last?.endsAt ?? 0));
    const endsAt = startsAt + (b.endsAt - b.startsAt);
    // keyed by its purchase, so a refund can take it down
    await db.insert(schema.billboards).values({
      id: tx.id, slot: b.slot, ownerId: tx.buyerId, boothId: b.boothId ?? null, headline: b.headline, body: b.body ?? null, website: b.website ?? null,
      imageUrl: b.imageUrl ?? null, color: b.color, startsAt, endsAt, amountCents: tx.amountCents, status: "active", createdAt: t,
    });
    await addEvent("billboard", b.boothId ?? null, `${b.headline} is now on a billboard`, b.slot === "airship" ? "Airship banner over the hall" : "Billboard over the aisles", tx.amountCents);
    await bumpSiteDaily({ revenueCents: tx.amountCents });
    await notify(tx.buyerId, "booth", "Your billboard is booked", startsAt > t + 60_000 ? `It goes up ${new Date(startsAt).toUTCString().slice(0, 16)}.` : "It's up now.").catch(() => {});
  }

  if (tx.buyerId && tx.amountCents > 0 && provider !== "comp") {
    const { describeTx } = await import("@/lib/payments");
    await sendReceipt(tx.buyerId, describeTx(tx), tx.amountCents, tx.id, tx.boothId || undefined).catch(() => {});
  }
  const booth = tx.boothId ? await getBooth(tx.boothId) : null;
  if (booth) {
    publish({
      type: "booth",
      booth: liveBooth(booth),
    });
  }
  await publishStats();
  // their first real payment is what pays a referral (never sign-up), now that it has been applied
  if (provider === "divinitycoin") { const { payReferral } = await import("@/lib/referrals"); await payReferral(updated[0]).catch(() => {}); }
  return updated[0];
}

export async function addEvent(type: string, boothId: number | null, title: string, detail: string | null, amountCents: number | null) {
  const ev = { id: newId(), type, boothId, title, detail, amountCents, createdAt: now() };
  await db.insert(schema.events).values(ev);
  publish({ type: "event", event: ev });
  return ev;
}

export async function siteStats() {
  await ensureMigrated();
  const [s] = await db
    .select({
      sales: sql<number>`coalesce(sum(case when status = 'paid' then amount_cents else 0 end), 0)`,
    })
    .from(schema.transactions);
  const [p] = await db
    .select({
      claimed: sql<number>`count(*)`,
      views: sql<number>`coalesce(sum(total_views), 0)`,
      impressions: sql<number>`coalesce(sum(total_impressions), 0)`,
      value: sql<number>`coalesce(sum(value_cents), 0)`,
    })
    .from(schema.booths)
    .where(sql`owner_id IS NOT NULL`);
  const [sd] = await db.select({ visits: sql<number>`coalesce(sum(visits), 0)` }).from(schema.siteDaily);
  return {
    totalSalesCents: Number(s?.sales ?? 0),
    claimed: Number(p?.claimed ?? 0),
    totalViews: Number(sd?.visits ?? 0),
    totalBoothViews: Number(p?.views ?? 0),
    totalImpressions: Number(p?.impressions ?? 0),
    totalValueCents: Number(p?.value ?? 0),
  };
}

async function publishStats() {
  const s = await siteStats();
  publish({ type: "stats", totalSalesCents: s.totalSalesCents, totalViews: s.totalViews, claimed: s.claimed });
}

export async function recentEvents(limit = 30) {
  await ensureMigrated();
  return db.select().from(schema.events).orderBy(desc(schema.events.createdAt)).limit(limit);
}

export async function boothHistory(boothId: number) {
  return db
    .select()
    .from(schema.transactions)
    .where(and(eq(schema.transactions.boothId, boothId), eq(schema.transactions.status, "paid")))
    .orderBy(schema.transactions.createdAt);
}

export async function updateBooth(boothId: number, ownerId: string, draft: Partial<BoothDraft>) {
  const p = await getBooth(boothId);
  if (!p || p.ownerId !== ownerId) throw new Error("Not your booth");
  // the logo is only checked when this edit changes it, so an older stored logo doesn't block unrelated edits
  const d = sanitizeDraft({ ...p, ...draft, logoUrl: "logoUrl" in draft ? draft.logoUrl : undefined, name: draft.name ?? p.name ?? "" } as BoothDraft);
  if (!("logoUrl" in draft)) delete (d as Partial<BoothDraft>).logoUrl;
  await db.update(schema.booths).set({ ...d, updatedAt: now() }).where(eq(schema.booths.id, boothId));
  const booth = (await getBooth(boothId))!;
  if (!booth.hidden) publish({ type: "booth", booth: liveBooth(booth) }); // a booth an admin hid stays off the floor
  return booth;
}

export async function unclaimedCount(): Promise<number> {
  const claimed = (await db.select({ c: sql<number>`count(*)` }).from(schema.booths).where(sql`owner_id IS NOT NULL`))[0];
  return TOTAL_BOOTHS - Number(claimed?.c ?? 0);
}

export async function activeBillboards() {
  await ensureMigrated();
  const t = now();
  return db
    .select()
    .from(schema.billboards)
    .where(and(eq(schema.billboards.status, "active"), sql`${schema.billboards.startsAt} <= ${t}`, sql`${schema.billboards.endsAt} > ${t}`))
    .orderBy(schema.billboards.slot);
}

export async function trackBillboard(id: string, metric: "seen" | "opens" | "clicks") {
  const set =
    metric === "seen"
      ? { seen: sql`${schema.billboards.seen} + 1` }
      : metric === "opens"
        ? { opens: sql`${schema.billboards.opens} + 1` }
        : { clicks: sql`${schema.billboards.clicks} + 1` };
  await db.update(schema.billboards).set(set).where(eq(schema.billboards.id, id));
}

/* ---------- booth codes ---------- */

export const normalizeCode = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

/** A code that can pay for this booth right now, or an error explaining why not. */
export async function checkBoothCode(raw: string, boothId: number) {
  await ensureMigrated();
  const code = normalizeCode(raw);
  if (!code) throw new Error("Enter a code");
  const [c] = await db.select().from(schema.boothCodes).where(eq(schema.boothCodes.code, code)).limit(1);
  if (!c || c.revokedAt) throw new Error("That code isn't valid");
  if (c.expiresAt && c.expiresAt < now()) throw new Error("That code has expired");
  if (c.uses >= c.maxUses) throw new Error("That code has already been used");
  const space = boothSpace(boothId);
  if (!space) throw new Error("No such booth");
  if (c.size !== "any" && c.size !== space.size) throw new Error(`That code is for a ${BOOTH_SIZES[c.size as keyof typeof BOOTH_SIZES]?.name ?? c.size}, not this ${BOOTH_SIZES[space.size].name.toLowerCase()}`);
  return c;
}

/* ---------- settle safety ---------- */

export class SettleConflict extends Error {}

/** Consume what this payment relies on (a booth code use, account credit) atomically, after checking the booth is still
 *  available on the terms quoted. Returns a reason when it can't, having released anything it took. */
async function claimInputs(tx: Tx, meta: { creditUsed?: number; codeId?: string }): Promise<string | null> {
  if (tx.kind === "claim") {
    const b = await getBooth(tx.boothId);
    if (b?.ownerId && b.ownerId !== tx.buyerId) return "Someone else claimed this booth first.";
  }
  if (tx.kind === "takeover") {
    const b = await getBooth(tx.boothId);
    if (!b || b.ownerId !== tx.sellerId || b.valueCents !== tx.valueBefore) return "The booth changed hands or value before this payment landed.";
    if (b.notForSaleUntil && b.notForSaleUntil > now()) return "The booth became protected from takeovers before this payment landed.";
  }
  // upgrades are for the buyer's own booth: if it changed hands meanwhile, the money must not lift someone else's booth
  if (tx.kind === "boost" || tx.kind === "banner" || tx.kind === "book" || tx.kind === "tier") {
    const b = await getBooth(tx.boothId);
    if (!b || b.ownerId !== tx.buyerId) return "This booth changed hands before the payment landed.";
  }
  let codeTaken = false;
  if (meta.codeId && tx.buyerId) {
    // a multi-use code is still one booth per person
    const [mine] = await db.select({ id: schema.codeRedemptions.id }).from(schema.codeRedemptions).where(and(eq(schema.codeRedemptions.codeId, meta.codeId), eq(schema.codeRedemptions.userId, tx.buyerId))).limit(1);
    if (mine) return "You've already used this booth code.";
  }
  if (meta.codeId) {
    const r = await db.update(schema.boothCodes).set({ uses: sql`${schema.boothCodes.uses} + 1` })
      .where(and(eq(schema.boothCodes.id, meta.codeId), sql`${schema.boothCodes.uses} < ${schema.boothCodes.maxUses}`, isNull(schema.boothCodes.revokedAt))).returning({ id: schema.boothCodes.id });
    if (!r.length) return "The booth code was already used up.";
    codeTaken = true;
  }
  if (meta.creditUsed && tx.buyerId) {
    const promoUsed = await takeCredit(tx.buyerId, meta.creditUsed);
    const r = promoUsed === null ? [] : [1];
    if (promoUsed !== null) await db.update(schema.transactions).set({ meta: JSON.stringify({ ...(tx.meta ? JSON.parse(tx.meta) : {}), promoUsed }) }).where(eq(schema.transactions.id, tx.id));
    if (!r.length) {
      if (codeTaken) await db.update(schema.boothCodes).set({ uses: sql`max(0, ${schema.boothCodes.uses} - 1)` }).where(eq(schema.boothCodes.id, meta.codeId!));
      return "The account credit this checkout used was spent elsewhere first.";
    }
  }
  return null;
}
/** Give back what claimInputs took, when applying fails at the last step. */
export async function releaseInputs(tx: Tx, meta: { creditUsed?: number; codeId?: string; promoUsed?: number }) {
  if (meta.codeId) await db.update(schema.boothCodes).set({ uses: sql`max(0, ${schema.boothCodes.uses} - 1)` }).where(eq(schema.boothCodes.id, meta.codeId));
  if (meta.creditUsed && tx.buyerId) {
    // put each part back where it came from: referral credit stays spend-only
    const stored = (await db.select({ meta: schema.transactions.meta }).from(schema.transactions).where(eq(schema.transactions.id, tx.id)).limit(1))[0]?.meta;
    const promo = Math.min(meta.creditUsed, Math.max(0, Number(meta.promoUsed ?? (stored ? JSON.parse(stored).promoUsed : 0)) || 0));
    await db.update(schema.users).set({ creditCents: sql`${schema.users.creditCents} + ${meta.creditUsed - promo}`, promoCents: sql`${schema.users.promoCents} + ${promo}` }).where(eq(schema.users.id, tx.buyerId));
  }
}

/** A person's spendable credit: referral credit plus regular credit (a regular balance owed back after a clawback counts against it). */
export const spendableCredit = (u: { creditCents: number; promoCents: number }) => Math.max(0, u.creditCents + u.promoCents);

/**
 * Takes `amount` of credit, referral credit first, in a statement that only succeeds if both balances are still what
 * was read (retried a few times if something else changed them). Returns how much came from referral credit, or null
 * when there isn't enough.
 */
export async function takeCredit(userId: string, amount: number): Promise<number | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const [u] = await db.select({ c: schema.users.creditCents, p: schema.users.promoCents }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!u || u.c + u.p < amount) return null;
    const promo = Math.min(Math.max(0, u.p), amount), cash = amount - promo;
    if (u.c - cash < 0) return null;
    const r = await db.update(schema.users).set({ promoCents: sql`${schema.users.promoCents} - ${promo}`, creditCents: sql`${schema.users.creditCents} - ${cash}` })
      .where(and(eq(schema.users.id, userId), eq(schema.users.promoCents, u.p), eq(schema.users.creditCents, u.c))).returning({ id: schema.users.id });
    if (r.length) return promo;
  }
  return null;
}
/** The payment is real but nothing was granted: note it on the transaction, tell the buyer, and raise it in Sentinel. */
async function flagForRefund(tx: Tx, reason: string): Promise<Tx> {
  const note = `NOT APPLIED, refund due: ${reason}`;
  await db.update(schema.transactions).set({ notes: tx.notes ? `${tx.notes}\n${note}` : note }).where(eq(schema.transactions.id, tx.id));
  if (tx.buyerId) await notify(tx.buyerId, "booth", "Your payment couldn't be applied", `${reason} You'll be refunded ${formatMoney(tx.amountCents)}; nothing else to do.`, tx.boothId).catch(() => {});
  const { recordError } = await import("@/lib/sentinel");
  await recordError({ kind: "server", where: "settle", message: `Transaction ${tx.id} (${tx.kind}, booth ${tx.boothId}) paid but not applied: ${reason}`, url: `/admin/transactions/${tx.id}` }).catch(() => {});
  return { ...tx, notes: note };
}
