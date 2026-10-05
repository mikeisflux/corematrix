import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { audit } from "@/lib/auth";
import { addEvent, sanitizeDraft } from "@/lib/economy";
import { boothSeries, boothReferrerRows } from "@/lib/analytics";
import { cancelPlan } from "@/lib/subscriptions";
import { now } from "@/lib/util";
import { guard, bad, notFound, readJson, int, optStr, bool } from "../../_lib";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const [booth] = await db.select().from(schema.booths).where(eq(schema.booths.id, Number(id)));
  if (!booth) return notFound();
  const [[owner], txs, series, referrers] = await Promise.all([
    booth.ownerId ? db.select({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, booth.ownerId)) : [null],
    db.select().from(schema.transactions).where(eq(schema.transactions.boothId, booth.id)).orderBy(desc(schema.transactions.createdAt)).limit(40),
    boothSeries(booth.id, 30), boothReferrerRows(booth.id),
  ]);
  return NextResponse.json({ booth, owner, txs, series, referrers });
}
/* PATCH fields: name, tagline, description, website, hidden, notForSaleUntil(ms|null), valueCents; actions: release, transfer{email}, shield{days}, feature{days} */
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const [booth] = await db.select().from(schema.booths).where(eq(schema.booths.id, Number(id)));
  if (!booth) return notFound();
  const b = await readJson(req);
  const before = { ownerId: booth.ownerId, name: booth.name, website: booth.website, hidden: booth.hidden, valueCents: booth.valueCents, tier: booth.tier };
  switch (b.action) {
    case "release": {
      if (!booth.ownerId) return bad("Booth is not claimed.");
      if (booth.tier !== "free") await cancelPlan(booth.id, null).catch(() => null);
      await db.update(schema.booths).set({ ownerId: null, hidden: true, tier: "free", tierUntil: null, subscriptionId: null, subscriptionStatus: null, featuredUntil: null, notForSaleUntil: null, updatedAt: now() }).where(eq(schema.booths.id, booth.id));
      await addEvent("admin", booth.id, `Booth #${booth.id} was released`, optStr(b.reason, 200), null);
      await audit(g.id, "booth.release", "booth", String(booth.id), before, { reason: optStr(b.reason, 200) }, g.email);
      return NextResponse.json({ ok: true });
    }
    case "transfer": {
      const email = String(b.email || "").trim().toLowerCase();
      const [to] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
      if (!to) return bad("No user with that email.");
      await db.update(schema.booths).set({ ownerId: to.id, updatedAt: now() }).where(eq(schema.booths.id, booth.id));
      await audit(g.id, "booth.transfer", "booth", String(booth.id), before, { ownerId: to.id, email }, g.email);
      return NextResponse.json({ ok: true });
    }
    case "shield": { const until = now() + Math.max(0, int(b.days, 7)) * 86_400_000; await db.update(schema.booths).set({ notForSaleUntil: int(b.days, 7) > 0 ? until : null }).where(eq(schema.booths.id, booth.id)); await audit(g.id, "booth.shield", "booth", String(booth.id), { notForSaleUntil: booth.notForSaleUntil }, { notForSaleUntil: until }, g.email); return NextResponse.json({ ok: true }); }
    case "feature": { const until = now() + Math.max(0, int(b.days, 7)) * 86_400_000; await db.update(schema.booths).set({ featuredUntil: int(b.days, 7) > 0 ? until : null }).where(eq(schema.booths.id, booth.id)); await audit(g.id, "booth.feature", "booth", String(booth.id), { featuredUntil: booth.featuredUntil }, { featuredUntil: until }, g.email); return NextResponse.json({ ok: true }); }
  }
  const data: Partial<typeof schema.booths.$inferInsert> = { updatedAt: now() };
  if (b.name !== undefined || b.tagline !== undefined || b.description !== undefined || b.website !== undefined) {
    const d = sanitizeDraft({ name: str0(b.name, booth.name), tagline: str0(b.tagline, booth.tagline), description: str0(b.description, booth.description), website: str0(b.website, booth.website), color: booth.color, accent: booth.accent, style: booth.style, cloth: booth.cloth, category: booth.category });
    Object.assign(data, { name: d.name, tagline: d.tagline, description: d.description, website: d.website });
  }
  if (b.hidden !== undefined) data.hidden = bool(b.hidden);
  if (b.valueCents !== undefined) { const v = int(b.valueCents, booth.valueCents); if (v < 0) return bad("Value must be ≥ 0"); data.valueCents = v; }
  await db.update(schema.booths).set(data).where(eq(schema.booths.id, booth.id));
  await audit(g.id, "booth.update", "booth", String(booth.id), before, data, g.email);
  const [row] = await db.select().from(schema.booths).where(eq(schema.booths.id, booth.id));
  return NextResponse.json({ booth: row });
}
const str0 = (v: unknown, fallback: string | null) => (v === undefined ? fallback ?? "" : String(v ?? ""));
