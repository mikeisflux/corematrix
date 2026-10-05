import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { audit } from "@/lib/auth";
import { addEvent, sanitizeDraft } from "@/lib/economy";
import { plotSeries, plotReferrerRows } from "@/lib/analytics";
import { cancelPlan } from "@/lib/subscriptions";
import { now } from "@/lib/util";
import { guard, bad, notFound, readJson, int, optStr, bool } from "../../_lib";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const [plot] = await db.select().from(schema.plots).where(eq(schema.plots.id, Number(id)));
  if (!plot) return notFound();
  const [[owner], txs, series, referrers] = await Promise.all([
    plot.ownerId ? db.select({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, plot.ownerId)) : [null],
    db.select().from(schema.transactions).where(eq(schema.transactions.plotId, plot.id)).orderBy(desc(schema.transactions.createdAt)).limit(40),
    plotSeries(plot.id, 30), plotReferrerRows(plot.id),
  ]);
  return NextResponse.json({ plot, owner, txs, series, referrers });
}
/* PATCH fields: name, tagline, description, website, hidden, notForSaleUntil(ms|null), valueCents; actions: release, transfer{email}, shield{days}, feature{days} */
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const [plot] = await db.select().from(schema.plots).where(eq(schema.plots.id, Number(id)));
  if (!plot) return notFound();
  const b = await readJson(req);
  const before = { ownerId: plot.ownerId, name: plot.name, website: plot.website, hidden: plot.hidden, valueCents: plot.valueCents, tier: plot.tier };
  switch (b.action) {
    case "release": {
      if (!plot.ownerId) return bad("Booth is not claimed.");
      if (plot.tier !== "free") await cancelPlan(plot.id, null).catch(() => null);
      await db.update(schema.plots).set({ ownerId: null, hidden: true, tier: "free", tierUntil: null, subscriptionId: null, subscriptionStatus: null, featuredUntil: null, notForSaleUntil: null, updatedAt: now() }).where(eq(schema.plots.id, plot.id));
      await addEvent("admin", plot.id, `Booth #${plot.id} was released`, optStr(b.reason, 200), null);
      await audit(g.id, "booth.release", "booth", String(plot.id), before, { reason: optStr(b.reason, 200) }, g.email);
      return NextResponse.json({ ok: true });
    }
    case "transfer": {
      const email = String(b.email || "").trim().toLowerCase();
      const [to] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
      if (!to) return bad("No user with that email.");
      await db.update(schema.plots).set({ ownerId: to.id, updatedAt: now() }).where(eq(schema.plots.id, plot.id));
      await audit(g.id, "booth.transfer", "booth", String(plot.id), before, { ownerId: to.id, email }, g.email);
      return NextResponse.json({ ok: true });
    }
    case "shield": { const until = now() + Math.max(0, int(b.days, 7)) * 86_400_000; await db.update(schema.plots).set({ notForSaleUntil: int(b.days, 7) > 0 ? until : null }).where(eq(schema.plots.id, plot.id)); await audit(g.id, "booth.shield", "booth", String(plot.id), { notForSaleUntil: plot.notForSaleUntil }, { notForSaleUntil: until }, g.email); return NextResponse.json({ ok: true }); }
    case "feature": { const until = now() + Math.max(0, int(b.days, 7)) * 86_400_000; await db.update(schema.plots).set({ featuredUntil: int(b.days, 7) > 0 ? until : null }).where(eq(schema.plots.id, plot.id)); await audit(g.id, "booth.feature", "booth", String(plot.id), { featuredUntil: plot.featuredUntil }, { featuredUntil: until }, g.email); return NextResponse.json({ ok: true }); }
  }
  const data: Partial<typeof schema.plots.$inferInsert> = { updatedAt: now() };
  if (b.name !== undefined || b.tagline !== undefined || b.description !== undefined || b.website !== undefined) {
    const d = sanitizeDraft({ name: str0(b.name, plot.name), tagline: str0(b.tagline, plot.tagline), description: str0(b.description, plot.description), website: str0(b.website, plot.website), color: plot.color, accent: plot.accent, style: plot.style, shape: plot.shape, roof: plot.roof, floors: plot.floors });
    Object.assign(data, { name: d.name, tagline: d.tagline, description: d.description, website: d.website });
  }
  if (b.hidden !== undefined) data.hidden = bool(b.hidden);
  if (b.valueCents !== undefined) { const v = int(b.valueCents, plot.valueCents); if (v < 0) return bad("Value must be ≥ 0"); data.valueCents = v; }
  await db.update(schema.plots).set(data).where(eq(schema.plots.id, plot.id));
  await audit(g.id, "booth.update", "booth", String(plot.id), before, data, g.email);
  const [row] = await db.select().from(schema.plots).where(eq(schema.plots.id, plot.id));
  return NextResponse.json({ plot: row });
}
const str0 = (v: unknown, fallback: string | null) => (v === undefined ? fallback ?? "" : String(v ?? ""));
