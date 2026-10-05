/**
 * Cash-outs without a payment-platform payout API: the user turns credit into
 * a PayPal payout request, the credit leaves their balance at once, and an
 * admin pays it from the company PayPal and marks it paid (or rejects it,
 * which puts the credit back). Every step emails the user and is audited.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { newId, now } from "@/lib/util";
import { sendTemplate } from "@/lib/sendgrid";
import { formatMoney, PAYOUT_MAX_CENTS, PAYOUT_MIN_CENTS } from "@/lib/config";
import { audit } from "@/lib/auth";

export type Payout = typeof schema.payouts.$inferSelect;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestPayout(userId: string, input: { amountCents: number; paypalEmail: string; legalName: string; address: string }): Promise<Payout> {
  await ensureMigrated();
  const amount = Math.round(Number(input.amountCents));
  const paypalEmail = String(input.paypalEmail || "").trim().toLowerCase();
  const legalName = String(input.legalName || "").trim().slice(0, 120);
  const address = String(input.address || "").trim().slice(0, 400);
  if (!Number.isFinite(amount) || amount < PAYOUT_MIN_CENTS) throw new Error(`Minimum payout is ${formatMoney(PAYOUT_MIN_CENTS)}`);
  if (amount > PAYOUT_MAX_CENTS) throw new Error(`Maximum per request is ${formatMoney(PAYOUT_MAX_CENTS)}`);
  if (!EMAIL.test(paypalEmail)) throw new Error("Enter the email on your PayPal account");
  if (legalName.length < 3) throw new Error("Enter your legal name (needed for tax forms)");
  if (address.length < 8) throw new Error("Enter your mailing address (needed for tax forms)");
  const [open] = await db.select({ n: sql<number>`count(*)` }).from(schema.payouts).where(and(eq(schema.payouts.userId, userId), eq(schema.payouts.status, "pending")));
  if (Number(open.n) > 0) throw new Error("You already have a payout waiting. We'll send it before taking another request.");
  // deduct atomically: only succeeds when the balance covers it
  const [u] = await db.update(schema.users).set({ creditCents: sql`${schema.users.creditCents} - ${amount}` })
    .where(and(eq(schema.users.id, userId), sql`${schema.users.creditCents} >= ${amount}`)).returning();
  if (!u) throw new Error("Not enough credit for that amount");
  const row: typeof schema.payouts.$inferInsert = { id: newId(), userId, amountCents: amount, method: "paypal", paypalEmail, legalName, address, status: "pending", createdAt: now() };
  await db.insert(schema.payouts).values(row);
  void sendTemplate("payout_requested", u.email, { name: u.displayName ?? "", amount: formatMoney(amount), paypalEmail, payoutId: row.id }).catch(() => {});
  return row as Payout;
}

export async function myPayouts(userId: string): Promise<Payout[]> {
  await ensureMigrated();
  return db.select().from(schema.payouts).where(eq(schema.payouts.userId, userId)).orderBy(desc(schema.payouts.createdAt)).limit(50);
}

export async function listPayouts(status: string, page = 1, size = 50) {
  await ensureMigrated();
  const where = status ? eq(schema.payouts.status, status) : undefined;
  const [[{ total }], rows] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(schema.payouts).where(where),
    db.select({ p: schema.payouts, email: schema.users.email, displayName: schema.users.displayName, creditCents: schema.users.creditCents })
      .from(schema.payouts).leftJoin(schema.users, eq(schema.users.id, schema.payouts.userId)).where(where)
      .orderBy(desc(schema.payouts.createdAt)).limit(size).offset((page - 1) * size),
  ]);
  return { rows: rows.map((r) => ({ ...r.p, email: r.email, displayName: r.displayName, creditCents: r.creditCents })), total: Number(total), page, pages: Math.max(1, Math.ceil(Number(total) / size)) };
}

/** Money requested and not yet sent (what the company owes right now) plus what it has paid out, ever. */
export async function payoutTotals() {
  await ensureMigrated();
  const [[owed], [paid], [credit]] = await Promise.all([
    db.select({ n: sql<number>`count(*)`, sum: sql<number>`coalesce(sum(amount_cents),0)` }).from(schema.payouts).where(eq(schema.payouts.status, "pending")),
    db.select({ n: sql<number>`count(*)`, sum: sql<number>`coalesce(sum(amount_cents),0)` }).from(schema.payouts).where(eq(schema.payouts.status, "paid")),
    db.select({ sum: sql<number>`coalesce(sum(credit_cents),0)` }).from(schema.users),
  ]);
  return { owedCents: Number(owed.sum), owedCount: Number(owed.n), paidCents: Number(paid.sum), paidCount: Number(paid.n), creditOutstandingCents: Number(credit.sum) };
}

export async function markPayoutPaid(id: string, admin: { id: string; email: string }, reference: string, note?: string): Promise<Payout> {
  await ensureMigrated();
  const ref = String(reference || "").trim().slice(0, 120);
  if (!ref) throw new Error("Enter the PayPal transaction id");
  const [p] = await db.update(schema.payouts).set({ status: "paid", reference: ref, note: note?.trim() || null, adminId: admin.id, resolvedAt: now() })
    .where(and(eq(schema.payouts.id, id), eq(schema.payouts.status, "pending"))).returning();
  if (!p) throw new Error("Payout is not pending");
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, p.userId)).limit(1);
  if (u) void sendTemplate("payout_paid", u.email, { name: u.displayName ?? "", amount: formatMoney(p.amountCents), paypalEmail: p.paypalEmail, reference: ref, payoutId: p.id }).catch(() => {});
  await audit(admin.id, "payout.paid", "payout", p.id, { status: "pending" }, { status: "paid", reference: ref, amountCents: p.amountCents }, admin.email);
  return p;
}

export async function rejectPayout(id: string, admin: { id: string; email: string }, reason: string): Promise<Payout> {
  await ensureMigrated();
  const why = String(reason || "").trim().slice(0, 300) || "Details could not be verified";
  const [p] = await db.update(schema.payouts).set({ status: "rejected", note: why, adminId: admin.id, resolvedAt: now() })
    .where(and(eq(schema.payouts.id, id), eq(schema.payouts.status, "pending"))).returning();
  if (!p) throw new Error("Payout is not pending");
  const [u] = await db.update(schema.users).set({ creditCents: sql`${schema.users.creditCents} + ${p.amountCents}` }).where(eq(schema.users.id, p.userId)).returning();
  if (u) void sendTemplate("payout_rejected", u.email, { name: u.displayName ?? "", amount: formatMoney(p.amountCents), reason: why, payoutId: p.id }).catch(() => {});
  await audit(admin.id, "payout.rejected", "payout", p.id, { status: "pending" }, { status: "rejected", reason: why, creditRestoredCents: p.amountCents }, admin.email);
  return p;
}
