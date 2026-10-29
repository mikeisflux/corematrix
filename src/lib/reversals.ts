/**
 * Undoing a purchase. A full refund (by an admin or straight from DivinityCoin) takes back what the purchase granted;
 * a chargeback freezes what it paid out to someone else until an admin decides. Each step only acts if things are still
 * the way the purchase left them, so a booth that has since changed hands is not yanked from its new owner.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { formatMoney } from "@/lib/config";
import { now } from "@/lib/util";
import { notify } from "@/lib/notify";
import { getBooth, releaseInputs, type Tx } from "@/lib/economy";
import { publish } from "@/lib/realtime";

const note = async (txId: string, line: string) => {
  const [t] = await db.select({ notes: schema.transactions.notes }).from(schema.transactions).where(eq(schema.transactions.id, txId)).limit(1);
  await db.update(schema.transactions).set({ notes: [t?.notes, line].filter(Boolean).join("\n") }).where(eq(schema.transactions.id, txId));
};

/** Takes back a takeover's payout from the seller. Credit may go below zero, which blocks cash-outs until it is covered. */
async function clawbackSeller(tx: Tx, why: string) {
  if (!tx.sellerId || !tx.sellerPayoutCents) return;
  await db.update(schema.users).set({ creditCents: sql`${schema.users.creditCents} - ${tx.sellerPayoutCents}` }).where(eq(schema.users.id, tx.sellerId));
  await notify(tx.sellerId, "credit", `${formatMoney(tx.sellerPayoutCents)} booth credit taken back`, `The buyer's payment for your booth was ${why}, so the payout from it is on hold.`, tx.boothId).catch(() => {});
}

/** Called once, when a transaction becomes fully refunded. */
export async function reverseGrant(tx: Tx) {
  const meta = (tx.meta ? JSON.parse(tx.meta) : {}) as { creditUsed?: number; codeId?: string; coins?: number; previousName?: string; renewal?: boolean };
  const t = now();
  const done: string[] = [];
  const booth = tx.boothId ? await getBooth(tx.boothId) : null;
  const stillTheirs = !!booth && !!tx.buyerId && booth.ownerId === tx.buyerId;
  switch (tx.kind) {
    case "claim":
      if (stillTheirs) { await db.update(schema.booths).set({ ownerId: null, hidden: true, teamId: null, updatedAt: t }).where(and(eq(schema.booths.id, tx.boothId), eq(schema.booths.ownerId, tx.buyerId!))); done.push("booth released"); }
      break;
    case "takeover":
      await clawbackSeller(tx, "refunded"); done.push("seller payout taken back");
      if (stillTheirs && tx.sellerId) {
        await db.update(schema.booths).set({ ownerId: tx.sellerId, valueCents: tx.valueBefore, teamId: null, ...(meta.previousName ? { name: meta.previousName } : {}), updatedAt: t })
          .where(and(eq(schema.booths.id, tx.boothId), eq(schema.booths.ownerId, tx.buyerId!)));
        done.push("booth returned to the seller");
        await notify(tx.sellerId, "booth", "Your booth is back", "The takeover was refunded, so the booth is yours again. Check its design in the dashboard.", tx.boothId).catch(() => {});
      }
      break;
    case "tier":
      if (stillTheirs && booth!.tier !== "free") { const { dropPlan } = await import("@/lib/subscriptions"); await dropPlan(tx.boothId, "refunded"); done.push("plan ended"); }
      break;
    case "boost": case "banner": case "book":
      if (booth) { await db.update(schema.booths).set({ valueCents: sql`max(0, ${schema.booths.valueCents} - ${tx.amountCents})`, updatedAt: t }).where(eq(schema.booths.id, tx.boothId)); done.push("value taken back"); }
      break;
    case "coins":
      if (tx.buyerId && meta.coins) { await db.update(schema.users).set({ coins: sql`max(0, ${schema.users.coins} - ${meta.coins})` }).where(eq(schema.users.id, tx.buyerId)); done.push("coins taken back"); }
      break;
    case "billboard":
      await db.update(schema.billboards).set({ status: "ended" }).where(eq(schema.billboards.id, tx.id)); done.push("billboard taken down");
      break;
  }
  // credit or a code spent on this purchase goes back to the buyer: the purchase no longer exists
  if (meta.creditUsed || meta.codeId) { await releaseInputs(tx, meta); done.push("credit/code returned"); }
  if (done.length) await note(tx.id, `Refund reversed: ${done.join(", ")}.`);
  const fresh = tx.boothId ? await getBooth(tx.boothId) : null;
  if (fresh?.ownerId && !fresh.hidden) { const { liveBooth } = await import("@/lib/economy"); publish({ type: "booth", booth: liveBooth(fresh) }); }
}

/** A chargeback was opened: freeze what the payment paid out to someone else. */
export async function onDispute(tx: Tx) {
  if (tx.kind === "takeover") { await clawbackSeller(tx, "disputed by the buyer's bank"); await note(tx.id, "Dispute: seller payout put on hold."); }
}
