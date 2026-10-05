/**
 * The economy: claiming, takeovers, boosts and tiers. Every path creates a
 * transaction row first (pending), then `settle()` applies it once payment
 * is confirmed (comp/credit: immediately; DivinityCoin: from the webhook).
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { MIN_BOOST_CENTS, TIERS, type Tier, splitTakeover, formatMoney, CATEGORIES, BANNER_STYLES, BOOTH_SIZES, ZONES } from "@/lib/config";
import { clampStr, isHexColor, newId, normalizeUrl, now } from "@/lib/util";
import { publish } from "@/lib/realtime";
import { bumpSiteDaily } from "@/lib/analytics";
import { BILLBOARD_SLOTS } from "@/lib/config";
import { boothSpace, hallLayout, totalBooths, describeSpace } from "@/lib/hall/layout";
import { activatePlan } from "@/lib/subscriptions";
import { sendReceipt, sendSold, sendWelcome } from "@/lib/emails";
import { sendTemplate } from "@/lib/sendgrid";

export type Booth = typeof schema.booths.$inferSelect;

export function liveBooth(p: Booth) {
  return { id: p.id, valueCents: p.valueCents, name: p.name, color: p.color, accent: p.accent, style: p.style, cloth: p.cloth, category: p.category, tier: p.tier, hasLogo: !!p.logoUrl, tagline: p.tagline, website: p.website, size: p.size, kind: p.kind, label: p.label, hall: p.hall };
}
export type Tx = typeof schema.transactions.$inferSelect;

export interface BoothDraft {
  name: string;
  tagline?: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  color?: string;
  accent?: string;
  style?: string; // banner style
  cloth?: string; // table cloth / drape color
  category?: string;
}

export function sanitizeDraft(d: Partial<BoothDraft>): BoothDraft {
  const name = clampStr(d.name, 40);
  if (!name) throw new Error("Give your booth a name");
  const website = normalizeUrl(d.website);
  const logo = d.logoUrl ? (d.logoUrl.startsWith("/") ? d.logoUrl : normalizeUrl(d.logoUrl)) : null;
  return {
    name,
    tagline: clampStr(d.tagline, 90),
    description: clampStr(d.description, 600),
    website: website ?? undefined,
    logoUrl: logo ?? undefined,
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

export async function getBooth(id: number): Promise<Booth | null> {
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

export async function startClaim(boothId: number, buyerId: string, draft: BoothDraft, creditCents: number) {
  await ensureMigrated();
  if (!boothSpace(boothId)) throw new Error("No such booth");
  const p = await getBooth(boothId);
  if (p?.ownerId) throw new Error("That booth is already claimed. Try a takeover instead.");
  if (await heldByOther(boothId, buyerId)) throw new Error("Someone is checking out this booth right now. Try again in a few minutes or pick another.");
  const price = claimPriceCents(boothId);
  const credit = Math.min(creditCents, price);
  const tx: typeof schema.transactions.$inferInsert = {
    id: newId(),
    boothId,
    kind: "claim",
    buyerId,
    amountCents: price - credit,
    platformCents: price - credit,
    valueBefore: 0,
    valueAfter: price,
    status: "pending",
    meta: JSON.stringify({ draft, creditUsed: credit }),
    createdAt: now(),
  };
  await db.insert(schema.transactions).values(tx);
  await bumpSiteDaily({ checkoutStarts: 1 });
  return tx as Tx;
}

export async function startTakeover(boothId: number, buyerId: string, draft: BoothDraft, creditCents: number) {
  await ensureMigrated();
  const p = await getBooth(boothId);
  if (!p?.ownerId) throw new Error("That booth is unclaimed. Claim it instead.");
  if (p.ownerId === buyerId) throw new Error("You already own this booth. Boost it instead.");
  if (p.notForSaleUntil && p.notForSaleUntil > now()) throw new Error("This Headliner booth is shielded for a few more days.");
  const { price, sellerPayout, platform } = splitTakeover(p.valueCents);
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
    meta: JSON.stringify({ draft, creditUsed: credit, previousName: p.name }),
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
    imageUrl: d.imageUrl && (d.imageUrl.startsWith("/") || d.imageUrl.startsWith("data:")) ? d.imageUrl : normalizeUrl(d.imageUrl) ?? undefined,
    color: d.color && isHexColor(d.color) ? d.color : "#111827",
    boothId: d.boothId ?? null,
    startsAt,
    endsAt: startsAt + weeks * 7 * 86_400_000,
    weeks,
  };
  const tx: typeof schema.transactions.$inferInsert = {
    id: newId(),
    boothId: d.boothId ?? 0,
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
  await ensureMigrated();
  const [tx] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, txId)).limit(1);
  if (!tx) return null;
  if (tx.status === "paid") return tx;
  if (tx.status !== "pending") return tx;
  const meta = tx.meta
    ? (JSON.parse(tx.meta) as {
        draft?: BoothDraft;
        creditUsed?: number;
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

  if (meta.creditUsed && tx.buyerId) {
    await db
      .update(schema.users)
      .set({ creditCents: sql`max(0, ${schema.users.creditCents} - ${meta.creditUsed})` })
      .where(eq(schema.users.id, tx.buyerId));
  }

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
        claimedAt: t,
        updatedAt: t,
        lastSoldAt: t,
        salesCount: 1,
      })
      .onConflictDoUpdate({
        target: schema.booths.id,
        set: { ...spaceColumns(tx.boothId), ownerId: tx.buyerId, ...d, valueCents: tx.valueAfter, claimedAt: t, updatedAt: t, lastSoldAt: t, salesCount: 1, hidden: false },
      });
    await addEvent("claim", tx.boothId, `${d.name} is on the show floor`, `${describeSpace(boothSpace(tx.boothId)!)} · ${CATEGORIES[d.category ?? "comics"].name}`, tx.valueAfter);
    await bumpSiteDaily({ claims: 1, revenueCents: tx.amountCents });
    if (tx.buyerId) {
      await db.update(schema.users).set({ coins: sql`${schema.users.coins} + 50` }).where(eq(schema.users.id, tx.buyerId));
      await db.insert(schema.coinLedger).values({ id: newId(), userId: tx.buyerId, delta: 50, reason: "claim", ref: `booth:${tx.boothId}`, createdAt: t });
      await sendWelcome(tx.buyerId, tx.boothId, d.name);
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
        salesCount: sql`${schema.booths.salesCount} + 1`,
      })
      .where(eq(schema.booths.id, tx.boothId));
    if (tx.sellerId) {
      await db
        .update(schema.users)
        .set({ creditCents: sql`${schema.users.creditCents} + ${tx.sellerPayoutCents}` })
        .where(eq(schema.users.id, tx.sellerId));
      await db.insert(schema.notifications).values({
        id: newId(),
        userId: tx.sellerId,
        type: "sold",
        title: `${prev?.name ?? "Your booth"} was bought out`,
        body: `Booth ${prev?.label ?? tx.boothId} sold for ${formatMoney(tx.valueAfter)}. ${formatMoney(tx.sellerPayoutCents)} was added to your balance (${formatMoney(tx.sellerPayoutCents - tx.valueBefore)} profit). Claim a new booth or take one over.`,
        boothId: tx.boothId,
        createdAt: t,
      });
      await sendSold(tx.sellerId, tx.boothId, prev?.name ?? "Your booth", tx.valueAfter, tx.sellerPayoutCents, tx.valueBefore);
    }
    await addEvent("takeover", tx.boothId, `${d.name} took over booth ${prev?.label ?? tx.boothId}`, `Bought ${meta.previousName ?? "the space"} for ${formatMoney(tx.valueAfter)}`, tx.valueAfter);
    await bumpSiteDaily({ takeovers: 1, revenueCents: tx.amountCents });
  } else if (tx.kind === "boost") {
    const [p] = await db
      .update(schema.booths)
      .set({ valueCents: sql`${schema.booths.valueCents} + ${tx.amountCents}`, updatedAt: t })
      .where(eq(schema.booths.id, tx.boothId))
      .returning();
    await addEvent("boost", tx.boothId, `${p?.name ?? "A booth"} upgraded its signage`, `+${formatMoney(tx.amountCents)} in value · now ${formatMoney(p?.valueCents ?? 0)}`, tx.amountCents);
    await bumpSiteDaily({ boosts: 1, revenueCents: tx.amountCents });
  } else if (tx.kind === "tier" && meta.tier) {
    const pm = (meta as { paymentMethodId?: string }).paymentMethodId ?? null;
    const p = await activatePlan(tx.boothId, meta.tier, provider === "comp" ? null : pm);
    await addEvent("tier", tx.boothId, `${p?.name ?? "A booth"} is now a ${TIERS[meta.tier].name}`, meta.tier === "landmark" ? "Featured in the hall, takeover shield on" : "Unlocked full analytics", tx.amountCents);
    await bumpSiteDaily({ revenueCents: tx.amountCents });
    if (tx.buyerId) {
      const [u] = await db.select({ email: schema.users.email, notify: schema.users.notifyEmail, name: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, tx.buyerId));
      if (u?.notify) {
        await sendTemplate("plan_started", u.email, { subject: `${p?.name ?? `#${tx.boothId}`} is now a ${TIERS[meta.tier].name}`, fallbackText: `Your ${TIERS[meta.tier].name} plan is active. Renews every 30 days; cancel any time from the dashboard.`, name: u.name ?? u.email, boothName: p?.name ?? `#${tx.boothId}`, planName: TIERS[meta.tier].name, amount: formatMoney(tx.amountCents), perks: TIERS[meta.tier].perks.join(" · "), boothId: tx.boothId }, { userId: tx.buyerId, boothId: tx.boothId, txId: tx.id, channel: "system" });
      }
    }
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
  const d = sanitizeDraft({ ...p, ...draft, name: draft.name ?? p.name ?? "" } as BoothDraft);
  await db.update(schema.booths).set({ ...d, updatedAt: now() }).where(eq(schema.booths.id, boothId));
  const booth = (await getBooth(boothId))!;
  publish({
    type: "booth",
    booth: liveBooth(booth),
  });
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
