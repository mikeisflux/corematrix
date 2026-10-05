import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { audit, requestMagicLink } from "@/lib/auth";
import { addCoins } from "@/lib/arcade";
import { guard, bad, notFound, readJson, int, optStr } from "../../_lib";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!user) return notFound();
  const [booths, txs, coins, mail, [sessions]] = await Promise.all([
    db.select({ id: schema.plots.id, name: schema.plots.name, tier: schema.plots.tier, valueCents: schema.plots.valueCents, floors: schema.plots.floors, hidden: schema.plots.hidden, claimedAt: schema.plots.claimedAt, subscriptionStatus: schema.plots.subscriptionStatus }).from(schema.plots).where(eq(schema.plots.ownerId, id)).orderBy(desc(schema.plots.valueCents)),
    db.select().from(schema.transactions).where(sql`buyer_id = ${id} OR seller_id = ${id}`).orderBy(desc(schema.transactions.createdAt)).limit(50),
    db.select().from(schema.coinLedger).where(eq(schema.coinLedger.userId, id)).orderBy(desc(schema.coinLedger.createdAt)).limit(30),
    db.select({ id: schema.mailMessages.id, direction: schema.mailMessages.direction, subject: schema.mailMessages.subject, status: schema.mailMessages.status, createdAt: schema.mailMessages.createdAt }).from(schema.mailMessages).where(sql`user_id = ${id} OR to_email = ${user.email} OR from_email = ${user.email}`).orderBy(desc(schema.mailMessages.createdAt)).limit(20),
    db.select({ n: sql<number>`count(*)` }).from(schema.sessions).where(eq(schema.sessions.userId, id)),
  ]);
  return NextResponse.json({ user: { ...user, stripeCustomerId: undefined }, booths, txs, coins, mail, sessions: Number(sessions.n) });
}
/* PATCH { displayName?, handle?, notifyEmail?, isAdmin?, creditDeltaCents?, coinsDelta?, reason?, action?: "magic_link" | "sign_out_all" | "clear_card" } */
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!u) return notFound();
  const b = await readJson(req);
  const reason = optStr(b.reason, 300) || "admin";
  if (b.action === "magic_link") { const r = await requestMagicLink(u.email); await audit(g.id, "user.magic_link", "user", id, undefined, { email: u.email }, g.email); return NextResponse.json({ ok: true, devLink: r.devLink }); }
  if (b.action === "sign_out_all") { await db.delete(schema.sessions).where(eq(schema.sessions.userId, id)); await audit(g.id, "user.sign_out_all", "user", id, undefined, undefined, g.email); return NextResponse.json({ ok: true }); }
  if (b.action === "clear_card") { await db.update(schema.users).set({ dcPaymentMethodId: null }).where(eq(schema.users.id, id)); await audit(g.id, "user.clear_card", "user", id, { dcPaymentMethodId: u.dcPaymentMethodId }, undefined, g.email); return NextResponse.json({ ok: true }); }
  const data: Partial<typeof schema.users.$inferInsert> = {};
  if (typeof b.displayName === "string") data.displayName = optStr(b.displayName, 60);
  if (typeof b.handle === "string") data.handle = optStr(b.handle, 40);
  if (typeof b.notifyEmail === "boolean") data.notifyEmail = b.notifyEmail;
  if (typeof b.isAdmin === "boolean") { if (id === g.id && !b.isAdmin) return bad("You cannot remove your own admin access."); data.isAdmin = b.isAdmin; }
  const creditDelta = int(b.creditDeltaCents, 0), coinsDelta = int(b.coinsDelta, 0);
  if (creditDelta) { if (u.creditCents + creditDelta < 0) return bad("Credit cannot go negative."); data.creditCents = u.creditCents + creditDelta; }
  if (Object.keys(data).length) await db.update(schema.users).set(data).where(eq(schema.users.id, id));
  if (coinsDelta) await addCoins(id, coinsDelta, "admin", reason);
  await audit(g.id, "user.update", "user", id, { displayName: u.displayName, handle: u.handle, isAdmin: u.isAdmin, creditCents: u.creditCents, coins: u.coins }, { ...data, coinsDelta: coinsDelta || undefined, reason }, g.email);
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return NextResponse.json({ user: row });
}
export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  if (id === g.id) return bad("You cannot delete yourself.");
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!u) return notFound();
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.plots).where(eq(schema.plots.ownerId, id));
  if (Number(n) > 0) return bad("User still owns booths. Release or transfer them first.");
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, id));
  await db.delete(schema.notifications).where(eq(schema.notifications.userId, id));
  await db.delete(schema.users).where(eq(schema.users.id, id));
  await audit(g.id, "user.delete", "user", id, { email: u.email }, undefined, g.email);
  return NextResponse.json({ ok: true });
}
