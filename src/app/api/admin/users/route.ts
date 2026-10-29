import { NextResponse } from "next/server";
import { desc, eq, or, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { guard, pageParams, paged, like, toCsv, csvResponse, readJson, optStr, int } from "../_lib";
import { findOrCreateUser, hashPassword, requestPasswordReset, audit } from "@/lib/auth";
import { isAdminArea } from "@/lib/permissions";
import { addCoins } from "@/lib/arcade";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const g = await guard("users"); if (g instanceof NextResponse) return g;
  await ensureMigrated();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const u = schema.users;
  const where = q ? or(sql`${u.email} LIKE ${like(q)} ESCAPE '\\'`, sql`${u.displayName} LIKE ${like(q)} ESCAPE '\\'`, sql`${u.handle} LIKE ${like(q)} ESCAPE '\\'`, eq(u.id, q)) : undefined;
  const cols = { id: u.id, email: u.email, displayName: u.displayName, handle: u.handle, creditCents: u.creditCents, coins: u.coins, isAdmin: u.isAdmin, permissions: u.permissions, createdAt: u.createdAt, lastSeenAt: u.lastSeenAt, referredBy: u.referredBy, booths: sql<number>`(select count(*) from booths p where p.owner_id = ${u.id})`, spentCents: sql<number>`(select coalesce(sum(amount_cents),0) from transactions t where t.buyer_id = ${u.id} and t.status = 'paid')` };
  if (url.searchParams.get("export") === "csv") {
    const rows = await db.select(cols).from(u).where(where).orderBy(desc(u.createdAt)).limit(10000);
    return csvResponse("users.csv", toCsv(["id", "email", "name", "handle", "booths", "spent_cents", "credit_cents", "coins", "admin", "created_at", "last_seen_at"], rows.map((r) => [r.id, r.email, r.displayName, r.handle, r.booths, r.spentCents, r.creditCents, r.coins, r.isAdmin, new Date(r.createdAt).toISOString(), r.lastSeenAt ? new Date(r.lastSeenAt).toISOString() : ""])));
  }
  const { page, size, skip, take } = pageParams(url);
  const [[{ total }], rows] = await Promise.all([db.select({ total: sql<number>`count(*)` }).from(u).where(where), db.select(cols).from(u).where(where).orderBy(desc(u.createdAt)).limit(take).offset(skip)]);
  return NextResponse.json(paged(rows.map((r) => ({ ...r, booths: Number(r.booths), spentCents: Number(r.spentCents) })), Number(total), page, size));
}

/* POST { email, displayName?, handle?, password?, sendReset?, isAdmin?, permissions?, creditCents?, coins? }: create an account by hand.
   With no password the person gets a reset link to choose one. Admin flags and permissions can only be set by a superadmin. */
export async function POST(req: Request) {
  const g = await guard("users"); if (g instanceof NextResponse) return g;
  await ensureMigrated();
  const b = await readJson(req);
  const email = (optStr(b.email, 200) || "").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  if (exists) return NextResponse.json({ error: "That email already has an account" }, { status: 400 });
  const password = optStr(b.password, 200);
  if (password && password.length < 10) return NextResponse.json({ error: "Password must be at least 10 characters" }, { status: 400 });
  const perms = Array.isArray(b.permissions) ? b.permissions.filter(isAdminArea) : [];
  if ((b.isAdmin === true || perms.length) && !g.isAdmin) return NextResponse.json({ error: "Only a superadmin can grant admin access" }, { status: 403 });
  const user = await findOrCreateUser(email);
  const data: Partial<typeof schema.users.$inferInsert> = {
    displayName: optStr(b.displayName, 60) ?? user.displayName, handle: optStr(b.handle, 40),
    passwordHash: password ? hashPassword(password) : null,
    isAdmin: b.isAdmin === true, permissions: perms.length ? JSON.stringify(perms) : null,
    creditCents: Math.max(0, int(b.creditCents, 0)),
  };
  await db.update(schema.users).set(data).where(eq(schema.users.id, user.id));
  const coins = int(b.coins, 0); if (coins > 0) await addCoins(user.id, coins, "admin", "created by admin");
  if (!password || b.sendReset === true) await requestPasswordReset(email).catch(() => {});
  await audit(g.id, "user.create", "user", user.id, undefined, { email, isAdmin: data.isAdmin, permissions: perms, withPassword: !!password }, g.email);
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
  return NextResponse.json({ user: { ...row, passwordHash: undefined } });
}
