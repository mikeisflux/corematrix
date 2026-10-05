import { NextResponse } from "next/server";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { audit } from "@/lib/auth";
import { cancelPlan, chargeRenewal, runRenewals, currentMrrCents, activatePlan } from "@/lib/subscriptions";
import { TIERS, type Tier } from "@/lib/config";
import { now } from "@/lib/util";
import { guard, bad, notFound, readJson, int } from "../_lib";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  await ensureMigrated();
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "";
  const p = schema.plots, u = schema.users;
  const where = and(ne(p.tier, "free"), status ? eq(p.subscriptionStatus, status) : undefined);
  const [rows, mrr, renewals] = await Promise.all([
    db.select({ id: p.id, name: p.name, tier: p.tier, tierUntil: p.tierUntil, subscriptionId: p.subscriptionId, subscriptionStatus: p.subscriptionStatus, ownerId: p.ownerId, ownerEmail: u.email, hasCard: sql<number>`case when ${u.dcPaymentMethodId} is not null then 1 else 0 end` }).from(p).leftJoin(u, eq(u.id, p.ownerId)).where(where).orderBy(p.tierUntil).limit(500),
    currentMrrCents(),
    db.select({ id: schema.transactions.id, plotId: schema.transactions.plotId, status: schema.transactions.status, amountCents: schema.transactions.amountCents, createdAt: schema.transactions.createdAt, providerRef: schema.transactions.providerRef, notes: schema.transactions.notes }).from(schema.transactions).where(and(eq(schema.transactions.kind, "tier"), sql`${schema.transactions.meta} LIKE '%"renewal":true%'`)).orderBy(desc(schema.transactions.createdAt)).limit(30),
  ]);
  const t = Date.now();
  return NextResponse.json({ rows: rows.map((r) => ({ ...r, hasCard: !!Number(r.hasCard), priceCents: TIERS[r.tier as Tier]?.priceCents ?? 0, overdue: !!r.tierUntil && r.tierUntil < t })), mrr, renewals, tiers: Object.entries(TIERS).map(([k, v]) => ({ id: k, name: v.name, priceCents: v.priceCents })) });
}
/* POST { action: "run_renewals" | "charge" | "extend" | "cancel" | "comp", plotId?, days?, tier? } */
export async function POST(req: Request) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const b = await readJson(req);
  if (b.action === "run_renewals") { const r = await runRenewals(); await audit(g.id, "plans.run_renewals", "plan", null, undefined, r, g.email); return NextResponse.json(r); }
  const plotId = int(b.plotId, 0);
  const [plot] = await db.select().from(schema.plots).where(eq(schema.plots.id, plotId));
  if (!plot) return notFound();
  const before = { tier: plot.tier, tierUntil: plot.tierUntil, subscriptionStatus: plot.subscriptionStatus };
  switch (b.action) {
    case "charge": { if (plot.tier === "free") return bad("No plan on this booth."); const r = await chargeRenewal(plot.id, plot.tierUntil ?? now()); await audit(g.id, "plan.charge", "plan", String(plot.id), before, r, g.email); return r.ok ? NextResponse.json(r) : bad(r.error || "Charge failed"); }
    case "extend": { const days = int(b.days, 30); const until = Math.max(plot.tierUntil ?? now(), now()) + days * 86_400_000; await db.update(schema.plots).set({ tierUntil: until, subscriptionStatus: plot.subscriptionStatus === "past_due" ? "active" : plot.subscriptionStatus, updatedAt: now() }).where(eq(schema.plots.id, plot.id)); await audit(g.id, "plan.extend", "plan", String(plot.id), before, { tierUntil: until, days }, g.email); return NextResponse.json({ ok: true, until }); }
    case "cancel": { const r = await cancelPlan(plot.id, null); await audit(g.id, "plan.cancel", "plan", String(plot.id), before, r, g.email); return NextResponse.json({ ok: true, ...r }); }
    case "comp": { const tier = String(b.tier || "pro") as Tier; if (!TIERS[tier] || tier === "free") return bad("Pick pro or landmark."); await activatePlan(plot.id, tier, null); await db.update(schema.plots).set({ subscriptionId: `comp:${g.email}`, tierUntil: now() + int(b.days, 30) * 86_400_000 }).where(eq(schema.plots.id, plot.id)); await audit(g.id, "plan.comp", "plan", String(plot.id), before, { tier, days: int(b.days, 30) }, g.email); return NextResponse.json({ ok: true }); }
    default: return bad("Unknown action");
  }
}
