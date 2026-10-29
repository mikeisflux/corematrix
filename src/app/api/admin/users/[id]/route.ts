import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { audit, markVerified, requestPasswordReset, sendVerification, setPassword } from "@/lib/auth";
import { addCoins } from "@/lib/arcade";
import { guard, bad, notFound, readJson, int, optStr } from "../../_lib";
import { isAdminArea } from "@/lib/permissions";
import { notify } from "@/lib/notify";
import { formatMoney } from "@/lib/config";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard("users"); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!user) return notFound();
  const [booths, txs, coins, mail, [sessions]] = await Promise.all([
    db.select({ id: schema.booths.id, name: schema.booths.name, tier: schema.booths.tier, valueCents: schema.booths.valueCents, label: schema.booths.label, size: schema.booths.size, hidden: schema.booths.hidden, claimedAt: schema.booths.claimedAt, subscriptionStatus: schema.booths.subscriptionStatus }).from(schema.booths).where(eq(schema.booths.ownerId, id)).orderBy(desc(schema.booths.valueCents)),
    db.select().from(schema.transactions).where(sql`buyer_id = ${id} OR seller_id = ${id}`).orderBy(desc(schema.transactions.createdAt)).limit(50),
    db.select().from(schema.coinLedger).where(eq(schema.coinLedger.userId, id)).orderBy(desc(schema.coinLedger.createdAt)).limit(30),
    db.select({ id: schema.mailMessages.id, direction: schema.mailMessages.direction, subject: schema.mailMessages.subject, status: schema.mailMessages.status, createdAt: schema.mailMessages.createdAt }).from(schema.mailMessages).where(sql`user_id = ${id} OR to_email = ${user.email} OR from_email = ${user.email}`).orderBy(desc(schema.mailMessages.createdAt)).limit(20),
    db.select({ n: sql<number>`count(*)` }).from(schema.sessions).where(eq(schema.sessions.userId, id)),
  ]);
  return NextResponse.json({ user: { ...user, stripeCustomerId: undefined, passwordHash: undefined }, booths, txs, coins, mail, sessions: Number(sessions.n) });
}
/* PATCH { displayName?, handle?, notifyEmail?, isAdmin?, creditDeltaCents?, coinsDelta?, reason?, action?: "mark_verified" | "send_verification" | "reset_password" | "set_password" | "sign_out_all" | "clear_card" } */
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard("users"); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!u) return notFound();
  if (u.isAdmin && !g.isAdmin) return bad("Only a superadmin can change a superadmin's account.", 403);
  const b = await readJson(req);
  const reason = optStr(b.reason, 300) || "admin";
  if (b.action === "mark_verified") { await markVerified(id); await audit(g.id, "user.mark_verified", "user", id, undefined, { email: u.email }, g.email); return NextResponse.json({ ok: true }); }
  if (b.action === "send_verification") { const r = await sendVerification(id); await audit(g.id, "user.send_verification", "user", id, undefined, { email: u.email, result: r }, g.email); return NextResponse.json({ ok: true, status: r }); }
  if (b.action === "reset_password") { await requestPasswordReset(u.email); await audit(g.id, "user.reset_password", "user", id, undefined, { email: u.email }, g.email); return NextResponse.json({ ok: true }); }
  if (b.action === "sign_out_all") { await db.delete(schema.sessions).where(eq(schema.sessions.userId, id)); await audit(g.id, "user.sign_out_all", "user", id, undefined, undefined, g.email); return NextResponse.json({ ok: true }); }
  if (b.action === "set_password") {
    try { await setPassword(id, typeof b.password === "string" && b.password ? b.password : null); } catch (e) { return bad((e as Error).message); }
    await audit(g.id, "user.set_password", "user", id, undefined, { cleared: !b.password }, g.email);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "clear_card") { await db.update(schema.users).set({ dcPaymentMethodId: null }).where(eq(schema.users.id, id)); await audit(g.id, "user.clear_card", "user", id, { dcPaymentMethodId: u.dcPaymentMethodId }, undefined, g.email); return NextResponse.json({ ok: true }); }
  const data: Partial<typeof schema.users.$inferInsert> = {};
  if (typeof b.displayName === "string") data.displayName = optStr(b.displayName, 60);
  if (typeof b.handle === "string") data.handle = optStr(b.handle, 40);
  if (typeof b.notifyEmail === "boolean") data.notifyEmail = b.notifyEmail;
  if (typeof b.email === "string") {
    const email = b.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("Enter a valid email");
    if (email !== u.email) { const [dup] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)); if (dup) return bad("That email already has an account"); data.email = email; }
  }
  if (typeof b.isAdmin === "boolean") { if (!g.isAdmin) return bad("Only a superadmin can change admin access.", 403); if (id === g.id && !b.isAdmin) return bad("You cannot remove your own admin access."); data.isAdmin = b.isAdmin; }
  if (Array.isArray(b.permissions)) { if (!g.isAdmin) return bad("Only a superadmin can change permissions.", 403); const perms = b.permissions.filter(isAdminArea); data.permissions = perms.length ? JSON.stringify(perms) : null; }
  const creditDelta = int(b.creditDeltaCents, 0), coinsDelta = int(b.coinsDelta, 0);
  if (creditDelta) { if (u.creditCents + creditDelta < 0) return bad("Credit cannot go negative."); data.creditCents = u.creditCents + creditDelta; }
  if (Object.keys(data).length) await db.update(schema.users).set(data).where(eq(schema.users.id, id));
  if (coinsDelta) { await addCoins(id, coinsDelta, "admin", reason); await notify(id, "coins", `${coinsDelta > 0 ? "+" : ""}${coinsDelta} coins from the organisers`, reason); }
  if (creditDelta) await notify(id, "credit", `${creditDelta > 0 ? "+" : "-"}${formatMoney(Math.abs(creditDelta))} booth credit from the organisers`, reason);
  await audit(g.id, "user.update", "user", id, { email: u.email, displayName: u.displayName, handle: u.handle, isAdmin: u.isAdmin, permissions: u.permissions, creditCents: u.creditCents, coins: u.coins }, { ...data, coinsDelta: coinsDelta || undefined, reason }, g.email);
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return NextResponse.json({ user: row });
}
export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guard("users"); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  if (id === g.id) return bad("You cannot delete yourself.");
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!u) return notFound();
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.booths).where(eq(schema.booths.ownerId, id));
  if (Number(n) > 0) return bad("User still owns booths. Release or transfer them first.");
  if (u.isAdmin && !g.isAdmin) return bad("Only a superadmin can delete an admin.", 403);
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, id));
  await db.delete(schema.notifications).where(eq(schema.notifications.userId, id));
  await db.delete(schema.teamMembers).where(eq(schema.teamMembers.userId, id));
  await db.delete(schema.friendships).where(sql`from_id = ${id} OR to_id = ${id}`);
  await db.delete(schema.users).where(eq(schema.users.id, id));
  await audit(g.id, "user.delete", "user", id, { email: u.email }, undefined, g.email);
  return NextResponse.json({ ok: true });
}
