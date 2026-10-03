/**
 * The economy: claiming, takeovers, boosts and tiers. Every path creates a
 * transaction row first (pending), then `settle()` applies it once payment
 * is confirmed (sandbox: immediately; Stripe: from the webhook).
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import {
  BASE_CLAIM_PRICE_CENTS,
  MIN_BOOST_CENTS,
  TIERS,
  type Tier,
  splitTakeover,
  TOTAL_PLOTS,
  formatMoney,
  DISTRICTS,
  BUILDING_STYLES,
  BUILDING_SHAPES,
  ROOF_STYLES,
  PRICE_PER_FLOOR_CENTS,
  MAX_FLOORS,
  zoneFor,
} from "@/lib/config";
import { clampStr, isHexColor, newId, normalizeUrl, now } from "@/lib/util";
import { publish } from "@/lib/realtime";
import { bumpSiteDaily } from "@/lib/analytics";
import { BILLBOARD_SLOTS } from "@/lib/config";
import { floorsForValue } from "@/lib/city/layout";
import { activatePlan, planEmailCopy } from "@/lib/subscriptions";
import { sendSold, sendWelcome } from "@/lib/emails";
import { sendMail } from "@/lib/mailer";

export type Plot = typeof schema.plots.$inferSelect;

export function livePlot(p: Plot) {
  return { id: p.id, valueCents: p.valueCents, name: p.name, color: p.color, style: p.style, shape: p.shape, floors: p.floors, roof: p.roof, tier: p.tier, hasLogo: !!p.logoUrl, tagline: p.tagline, website: p.website, district: p.district };
}
export type Tx = typeof schema.transactions.$inferSelect;

export interface BuildingDraft {
  name: string;
  tagline?: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  color?: string;
  accent?: string;
  style?: string;
  shape?: string;
  roof?: string;
  district?: string;
  floors?: number;
}

export function sanitizeDraft(d: Partial<BuildingDraft>): BuildingDraft {
  const name = clampStr(d.name, 40);
  if (!name) throw new Error("Give your building a name");
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
    style: BUILDING_STYLES.includes((d.style ?? "") as never) ? d.style : "modern",
    shape: BUILDING_SHAPES.includes((d.shape ?? "") as never) ? d.shape : "tower",
    floors: Math.max(1, Math.min(MAX_FLOORS, Math.floor(Number(d.floors) || 1))),
    roof: ROOF_STYLES.includes((d.roof ?? "") as never) ? d.roof : "flat",
    district: d.district && DISTRICTS[d.district] ? d.district : "downtown",
  };
}

export async function getPlot(id: number): Promise<Plot | null> {
  await ensureMigrated();
  const [p] = await db.select().from(schema.plots).where(eq(schema.plots.id, id)).limit(1);
  return p ?? null;
}

export async function claimedPlots(): Promise<Plot[]> {
  await ensureMigrated();
  return db
    .select()
    .from(schema.plots)
    .where(and(sql`${schema.plots.ownerId} IS NOT NULL`, eq(schema.plots.hidden, false)))
    .orderBy(schema.plots.id);
}

/** Lowest unclaimed plot number, or null if sold out. */
export async function nextAvailablePlot(): Promise<number | null> {
  await ensureMigrated();
  const rows = await db.select({ id: schema.plots.id }).from(schema.plots).where(sql`${schema.plots.ownerId} IS NOT NULL`);
  const taken = new Set(rows.map((r) => r.id));
  for (let i = 1; i <= TOTAL_PLOTS; i++) if (!taken.has(i)) return i;
  return null;
}

export async function availablePlots(limit = 60): Promise<number[]> {
  await ensureMigrated();
  const rows = await db.select({ id: schema.plots.id }).from(schema.plots).where(sql`${schema.plots.ownerId} IS NOT NULL`);
  const taken = new Set(rows.map((r) => r.id));
  const out: number[] = [];
  for (let i = 1; i <= TOTAL_PLOTS && out.length < limit; i++) if (!taken.has(i)) out.push(i);
  return out;
}

/** Claim price = floors × price per floor, with the zone's minimum enforced. */
export function claimPriceCents(plotId: number, floors?: number): number {
  const z = zoneFor(plotId);
  const f = Math.max(z.minFloors, Math.min(MAX_FLOORS, Math.floor(floors ?? z.minFloors) || z.minFloors));
  return f * PRICE_PER_FLOOR_CENTS;
}

const HOLD_MS = 10 * 60_000;

/** A plot with a pending claim by someone else in the last 10 minutes is held. */
async function heldByOther(plotId: number, buyerId: string): Promise<boolean> {
  const [h] = await db
    .select({ id: schema.transactions.id })
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.plotId, plotId),
        eq(schema.transactions.kind, "claim"),
        eq(schema.transactions.status, "pending"),
        sql`${schema.transactions.buyerId} != ${buyerId}`,
        sql`${schema.transactions.createdAt} > ${now() - HOLD_MS}`,
      ),
    )
    .limit(1);
  return !!h;
}

export async function startClaim(plotId: number, buyerId: string, draft: BuildingDraft, creditCents: number) {
  await ensureMigrated();
  if (plotId < 1 || plotId > TOTAL_PLOTS) throw new Error("No such plot");
  const p = await getPlot(plotId);
  if (p?.ownerId) throw new Error("That plot is already claimed. Try a takeover instead.");
  if (await heldByOther(plotId, buyerId)) throw new Error("Someone is checking out this plot right now. Try again in a few minutes or pick another.");
  const z = zoneFor(plotId);
  const floors = Math.max(z.minFloors, Math.min(MAX_FLOORS, Math.floor(draft.floors ?? z.minFloors) || z.minFloors));
  draft = { ...draft, floors };
  const price = claimPriceCents(plotId, floors);
  const credit = Math.min(creditCents, price);
  const tx: typeof schema.transactions.$inferInsert = {
    id: newId(),
    plotId,
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

export async function startTakeover(plotId: number, buyerId: string, draft: BuildingDraft, creditCents: number) {
  await ensureMigrated();
  const p = await getPlot(plotId);
  if (!p?.ownerId) throw new Error("That plot is unclaimed. Claim it instead.");
  if (p.ownerId === buyerId) throw new Error("You already own this building. Boost it instead.");
  if (p.notForSaleUntil && p.notForSaleUntil > now()) throw new Error("This Landmark is shielded for a few more days.");
  const { price, sellerPayout, platform } = splitTakeover(p.valueCents);
  const credit = Math.min(creditCents, Math.max(0, price - sellerPayout));
  const tx: typeof schema.transactions.$inferInsert = {
    id: newId(),
    plotId,
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

export async function startBoost(plotId: number, buyerId: string, amountCents: number) {
  await ensureMigrated();
  const p = await getPlot(plotId);
  if (!p?.ownerId || p.ownerId !== buyerId) throw new Error("You can only boost a building you own");
  if (!Number.isFinite(amountCents) || amountCents < MIN_BOOST_CENTS) throw new Error(`Minimum boost is ${formatMoney(MIN_BOOST_CENTS)}`);
  const amt = Math.round(amountCents);
  const tx: typeof schema.transactions.$inferInsert = {
    id: newId(),
    plotId,
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

export async function startTier(plotId: number, buyerId: string, tier: Tier) {
  await ensureMigrated();
  const p = await getPlot(plotId);
  if (!p?.ownerId || p.ownerId !== buyerId) throw new Error("You can only upgrade a building you own");
  if (tier === "free") throw new Error("Pick a paid tier");
  const price = TIERS[tier].priceCents;
  const tx: typeof schema.transactions.$inferInsert = {
    id: newId(),
    plotId,
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
    plotId: 0,
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
  plotId?: number | null;
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
    plotId: d.plotId ?? null,
    startsAt,
    endsAt: startsAt + weeks * 7 * 86_400_000,
    weeks,
  };
  const tx: typeof schema.transactions.$inferInsert = {
    id: newId(),
    plotId: d.plotId ?? 0,
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
export async function settle(txId: string, provider: "sandbox" | "stripe", providerRef?: string): Promise<Tx | null> {
  await ensureMigrated();
  const [tx] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, txId)).limit(1);
  if (!tx) return null;
  if (tx.status === "paid") return tx;
  const meta = tx.meta
    ? (JSON.parse(tx.meta) as {
        draft?: BuildingDraft;
        creditUsed?: number;
        tier?: Tier;
        previousName?: string;
        coins?: number;
        billboard?: { slot: string; headline: string; body?: string; website?: string; imageUrl?: string; color: string; plotId: number | null; startsAt: number; endsAt: number };
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
      .insert(schema.plots)
      .values({
        id: tx.plotId,
        ownerId: tx.buyerId,
        ...d,
        valueCents: tx.valueAfter,
        claimedAt: t,
        updatedAt: t,
        lastSoldAt: t,
        salesCount: 1,
      })
      .onConflictDoUpdate({
        target: schema.plots.id,
        set: { ownerId: tx.buyerId, ...d, valueCents: tx.valueAfter, claimedAt: t, updatedAt: t, lastSoldAt: t, salesCount: 1, hidden: false },
      });
    await addEvent("claim", tx.plotId, `${d.name} joined the avenue`, `Plot #${tx.plotId} · ${DISTRICTS[d.district ?? "downtown"].name}`, tx.valueAfter);
    await bumpSiteDaily({ claims: 1, revenueCents: tx.amountCents });
    if (tx.buyerId) {
      await db.update(schema.users).set({ coins: sql`${schema.users.coins} + 50` }).where(eq(schema.users.id, tx.buyerId));
      await db.insert(schema.coinLedger).values({ id: newId(), userId: tx.buyerId, delta: 50, reason: "claim", ref: `plot:${tx.plotId}`, createdAt: t });
      await sendWelcome(tx.buyerId, tx.plotId, d.name);
    }
  } else if (tx.kind === "takeover" && meta.draft) {
    const d = sanitizeDraft(meta.draft);
    const prev = await getPlot(tx.plotId);
    await db
      .update(schema.plots)
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
        salesCount: sql`${schema.plots.salesCount} + 1`,
      })
      .where(eq(schema.plots.id, tx.plotId));
    if (tx.sellerId) {
      await db
        .update(schema.users)
        .set({ creditCents: sql`${schema.users.creditCents} + ${tx.sellerPayoutCents}` })
        .where(eq(schema.users.id, tx.sellerId));
      await db.insert(schema.notifications).values({
        id: newId(),
        userId: tx.sellerId,
        type: "sold",
        title: `${prev?.name ?? "Your building"} was bought out`,
        body: `Plot #${tx.plotId} sold for ${formatMoney(tx.valueAfter)}. ${formatMoney(tx.sellerPayoutCents)} was added to your balance (${formatMoney(tx.sellerPayoutCents - tx.valueBefore)} profit). Claim a new plot or take one over.`,
        plotId: tx.plotId,
        createdAt: t,
      });
      await sendSold(tx.sellerId, tx.plotId, prev?.name ?? "Your building", tx.valueAfter, tx.sellerPayoutCents, tx.valueBefore);
    }
    await addEvent("takeover", tx.plotId, `${d.name} took over Plot #${tx.plotId}`, `Bought ${meta.previousName ?? "the building"} for ${formatMoney(tx.valueAfter)}`, tx.valueAfter);
    await bumpSiteDaily({ takeovers: 1, revenueCents: tx.amountCents });
  } else if (tx.kind === "boost") {
    const [p] = await db
      .update(schema.plots)
      .set({ valueCents: sql`${schema.plots.valueCents} + ${tx.amountCents}`, updatedAt: t })
      .where(eq(schema.plots.id, tx.plotId))
      .returning();
    await addEvent("boost", tx.plotId, `${p?.name ?? "A building"} grew taller`, `+${formatMoney(tx.amountCents)} in value · now ${formatMoney(p?.valueCents ?? 0)}`, tx.amountCents);
    await bumpSiteDaily({ boosts: 1, revenueCents: tx.amountCents });
  } else if (tx.kind === "tier" && meta.tier) {
    const subId = providerRef?.startsWith("sub_") ? providerRef : null;
    const p = await activatePlan(tx.plotId, meta.tier, subId, provider);
    await addEvent("tier", tx.plotId, `${p?.name ?? "A building"} is now a ${TIERS[meta.tier].name}`, meta.tier === "landmark" ? "Featured on the skyline, takeover shield on" : "Unlocked full analytics", tx.amountCents);
    await bumpSiteDaily({ revenueCents: tx.amountCents });
    if (tx.buyerId) {
      const [u] = await db.select({ email: schema.users.email, notify: schema.users.notifyEmail }).from(schema.users).where(eq(schema.users.id, tx.buyerId));
      if (u?.notify) {
        const copy = planEmailCopy(meta.tier, p?.name ?? `Plot #${tx.plotId}`);
        await sendMail(u.email, copy.subject, copy.html);
      }
    }
  }

  else if (tx.kind === "coins" && meta.coins && tx.buyerId) {
    await db.update(schema.users).set({ coins: sql`${schema.users.coins} + ${meta.coins}` }).where(eq(schema.users.id, tx.buyerId));
    await db.insert(schema.coinLedger).values({ id: newId(), userId: tx.buyerId, delta: meta.coins, reason: "purchase", ref: tx.id, createdAt: t });
    await bumpSiteDaily({ revenueCents: tx.amountCents });
  } else if (tx.kind === "billboard" && meta.billboard && tx.buyerId) {
    const b = meta.billboard;
    await db.insert(schema.billboards).values({
      id: newId(),
      slot: b.slot,
      ownerId: tx.buyerId,
      plotId: b.plotId,
      headline: b.headline,
      body: b.body ?? null,
      website: b.website ?? null,
      imageUrl: b.imageUrl ?? null,
      color: b.color,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      amountCents: tx.amountCents,
      status: "active",
      createdAt: t,
    });
    await addEvent("billboard", b.plotId, `${b.headline} is now on a billboard`, b.slot === "airship" ? "Airship banner over the avenue" : "Roadside billboard", tx.amountCents);
    await bumpSiteDaily({ revenueCents: tx.amountCents });
  }

  if (tx.plotId) {
    await db.update(schema.plots).set({ floors: sql`max(${schema.plots.floors}, ${floorsForValue(tx.valueAfter)})` }).where(eq(schema.plots.id, tx.plotId));
  }
  const plot = tx.plotId ? await getPlot(tx.plotId) : null;
  if (plot) {
    publish({
      type: "plot",
      plot: livePlot(plot),
    });
  }
  await publishStats();
  return updated[0];
}

export async function addEvent(type: string, plotId: number | null, title: string, detail: string | null, amountCents: number | null) {
  const ev = { id: newId(), type, plotId, title, detail, amountCents, createdAt: now() };
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
    .from(schema.plots)
    .where(sql`owner_id IS NOT NULL`);
  const [sd] = await db.select({ visits: sql<number>`coalesce(sum(visits), 0)` }).from(schema.siteDaily);
  return {
    totalSalesCents: Number(s?.sales ?? 0),
    claimed: Number(p?.claimed ?? 0),
    totalViews: Number(sd?.visits ?? 0),
    totalPlotViews: Number(p?.views ?? 0),
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

export async function plotHistory(plotId: number) {
  return db
    .select()
    .from(schema.transactions)
    .where(and(eq(schema.transactions.plotId, plotId), eq(schema.transactions.status, "paid")))
    .orderBy(schema.transactions.createdAt);
}

export async function updateBuilding(plotId: number, ownerId: string, draft: Partial<BuildingDraft>) {
  const p = await getPlot(plotId);
  if (!p || p.ownerId !== ownerId) throw new Error("Not your building");
  const d = sanitizeDraft({ ...p, ...draft, name: draft.name ?? p.name ?? "" } as BuildingDraft);
  await db.update(schema.plots).set({ ...d, updatedAt: now() }).where(eq(schema.plots.id, plotId));
  const plot = (await getPlot(plotId))!;
  publish({
    type: "plot",
    plot: livePlot(plot),
  });
  return plot;
}

export async function unclaimedCount(): Promise<number> {
  const [r] = await db.select({ c: sql<number>`count(*)` }).from(schema.plots).where(isNull(schema.plots.ownerId));
  const claimed = (await db.select({ c: sql<number>`count(*)` }).from(schema.plots).where(sql`owner_id IS NOT NULL`))[0];
  void r;
  return TOTAL_PLOTS - Number(claimed?.c ?? 0);
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
