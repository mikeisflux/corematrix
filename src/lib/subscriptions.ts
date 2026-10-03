/**
 * Plans as real subscriptions. Stripe: Checkout in subscription mode, renewals
 * from `invoice.paid`, cancellation from `customer.subscription.deleted`.
 * Sandbox: a fake subscription that the daily cron renews until canceled, so
 * the whole lifecycle can be exercised locally.
 */
import { and, eq, lt, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { TIERS, type Tier, SITE_NAME, SITE_URL } from "@/lib/config";
import { newId, now } from "@/lib/util";
import { bumpSiteDaily } from "@/lib/analytics";
import { getStripe, paymentsMode } from "@/lib/payments";
import { addEvent, getPlot } from "@/lib/economy";

const PERIOD = 30 * 86_400_000;

/** Called when a tier purchase settles. Marks the plot as subscribed. */
export async function activatePlan(plotId: number, tier: Tier, subscriptionId: string | null, provider: "sandbox" | "stripe") {
  const t = now();
  const [p] = await db
    .update(schema.plots)
    .set({
      tier,
      tierUntil: t + PERIOD,
      subscriptionId: subscriptionId ?? `sandbox:${newId()}`,
      subscriptionStatus: "active",
      notForSaleUntil: tier === "landmark" ? t + 7 * 86_400_000 : null,
      updatedAt: t,
    })
    .where(eq(schema.plots.id, plotId))
    .returning();
  void provider;
  return p;
}

/** A renewal payment arrived (Stripe invoice.paid, or sandbox cron). Extends the period and books revenue. */
export async function renewPlan(plotId: number, amountCents: number, provider: "sandbox" | "stripe", ref?: string) {
  await ensureMigrated();
  const p = await getPlot(plotId);
  if (!p || p.tier === "free") return;
  const base = Math.max(now(), p.tierUntil ?? 0);
  await db.update(schema.plots).set({ tierUntil: base + PERIOD, subscriptionStatus: "active", updatedAt: now() }).where(eq(schema.plots.id, plotId));
  await db.insert(schema.transactions).values({
    id: newId(),
    plotId,
    kind: "tier",
    buyerId: p.ownerId,
    amountCents,
    platformCents: amountCents,
    valueBefore: p.valueCents,
    valueAfter: p.valueCents,
    status: "paid",
    provider,
    providerRef: ref ?? null,
    meta: JSON.stringify({ tier: p.tier, renewal: true }),
    createdAt: now(),
    paidAt: now(),
  });
  await bumpSiteDaily({ revenueCents: amountCents });
}

/** Owner asked to stop. Keeps perks until the paid period ends. */
export async function cancelPlan(plotId: number, ownerId: string): Promise<{ until: number | null }> {
  await ensureMigrated();
  const p = await getPlot(plotId);
  if (!p || p.ownerId !== ownerId) throw new Error("Not your building");
  if (!p.subscriptionId || p.tier === "free") throw new Error("No active plan on this building");
  if (paymentsMode === "stripe" && !p.subscriptionId.startsWith("sandbox:")) {
    await getStripe().subscriptions.update(p.subscriptionId, { cancel_at_period_end: true });
  }
  await db.update(schema.plots).set({ subscriptionStatus: "canceling", updatedAt: now() }).where(eq(schema.plots.id, plotId));
  return { until: p.tierUntil };
}

/** Stripe told us the subscription is gone. */
export async function markCanceled(subscriptionId: string) {
  await ensureMigrated();
  await db.update(schema.plots).set({ subscriptionStatus: "canceled", updatedAt: now() }).where(eq(schema.plots.subscriptionId, subscriptionId));
}

/** Stripe told us a payment failed. Perks continue until tierUntil; we flag it in the dashboard. */
export async function markPastDue(subscriptionId: string) {
  await ensureMigrated();
  await db.update(schema.plots).set({ subscriptionStatus: "past_due", updatedAt: now() }).where(eq(schema.plots.subscriptionId, subscriptionId));
}

/** Find the plot a Stripe subscription belongs to. */
export async function plotForSubscription(subscriptionId: string) {
  const [p] = await db.select().from(schema.plots).where(eq(schema.plots.subscriptionId, subscriptionId)).limit(1);
  return p ?? null;
}

/**
 * Daily maintenance:
 *  - sandbox subscriptions that are active and expired renew (simulating Stripe)
 *  - everything else that is past tierUntil drops to free
 */
export async function maintainPlans(): Promise<{ renewed: number; expired: number }> {
  await ensureMigrated();
  const t = now();
  let renewed = 0, expired = 0;
  const due = await db.select().from(schema.plots).where(and(sql`${schema.plots.tier} != 'free'`, lt(schema.plots.tierUntil, t)));
  for (const p of due) {
    const sandboxActive = p.subscriptionId?.startsWith("sandbox:") && p.subscriptionStatus === "active";
    if (sandboxActive) {
      await renewPlan(p.id, TIERS[p.tier as Tier].priceCents, "sandbox", "cron-renewal");
      renewed++;
    } else {
      await db.update(schema.plots).set({ tier: "free", tierUntil: null, subscriptionId: null, subscriptionStatus: null, updatedAt: t }).where(eq(schema.plots.id, p.id));
      await addEvent("tier", p.id, `${p.name} is back on the Owner plan`, null, null);
      expired++;
    }
  }
  return { renewed, expired };
}

/** Monthly recurring revenue from plans that will renew. */
export async function currentMrrCents(): Promise<number> {
  await ensureMigrated();
  const [r] = await db
    .select({
      pro: sql<number>`sum(case when tier='pro' and subscription_status='active' then 1 else 0 end)`,
      lm: sql<number>`sum(case when tier='landmark' and subscription_status='active' then 1 else 0 end)`,
    })
    .from(schema.plots);
  return Number(r?.pro ?? 0) * TIERS.pro.priceCents + Number(r?.lm ?? 0) * TIERS.landmark.priceCents;
}

export function planEmailCopy(tier: Tier, plotName: string) {
  return {
    subject: `${plotName} is now a ${TIERS[tier].name} on ${SITE_NAME}`,
    html: `<p><b>${plotName}</b> is on the ${TIERS[tier].name} plan.</p><ul>${TIERS[tier].perks.map((p) => `<li>${p}</li>`).join("")}</ul><p>Renews every 30 days. Cancel any time from <a href="${SITE_URL}/dashboard">your dashboard</a>.</p>`,
  };
}
