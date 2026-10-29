/**
 * Referral credit. Someone who joins with your link is remembered at sign-up, but nobody is paid then:
 * making accounts is free, so paying at sign-up let anyone farm credit with throwaway emails. Both sides
 * are paid when the new person's first real payment clears, and a refund or chargeback of that payment
 * takes it back. A qualifying payment is always larger than the credit it earns, so farming costs money.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { REFERRAL_CREDIT_CENTS, REFERRAL_QUALIFY_CENTS, formatMoney } from "@/lib/config";
import { now } from "@/lib/util";
import { notify } from "@/lib/notify";
import { sendTemplate } from "@/lib/sendgrid";
import { addCoins, COIN_RULES } from "@/lib/arcade";


type PaidTx = { id: string; buyerId: string | null; amountCents: number; refundedCents: number; provider: string | null; providerRef?: string | null; sessionId?: string | null };
/** Test-mode checkouts are settled as DivinityCoin too, with test ids: they move no money, so they never earn a referral. */
const isTestPayment = (tx: PaidTx) => /(^|\|)(pi|cs|hold|set)_test_/.test(`${tx.providerRef ?? ""}|${tx.sessionId ?? ""}`);

/** Called once a payment has settled and been applied. Pays the referral if this is the buyer's qualifying payment. */
export async function payReferral(tx: PaidTx) {
  if (!tx.buyerId || tx.provider !== "divinitycoin" || isTestPayment(tx) || tx.amountCents - tx.refundedCents < REFERRAL_QUALIFY_CENTS) return;
  await ensureMigrated();
  // claim the payout in one statement, so two payments settling together can't both pay it
  const [buyer] = await db.update(schema.users).set({ referralPaidAt: now(), referralTxId: tx.id })
    .where(and(eq(schema.users.id, tx.buyerId), sql`${schema.users.referredBy} IS NOT NULL`, sql`${schema.users.referredBy} != ${tx.buyerId}`, isNull(schema.users.referralPaidAt)))
    .returning();
  if (!buyer?.referredBy) return;
  const [referrer] = await db.select().from(schema.users).where(eq(schema.users.id, buyer.referredBy)).limit(1);
  if (!referrer) return;
  const amt = REFERRAL_CREDIT_CENTS, money = formatMoney(amt);
  await db.update(schema.users).set({ creditCents: sql`${schema.users.creditCents} + ${amt}` }).where(eq(schema.users.id, buyer.id));
  await db.update(schema.users).set({ creditCents: sql`${schema.users.creditCents} + ${amt}` }).where(eq(schema.users.id, referrer.id));
  await addCoins(buyer.id, COIN_RULES.referral, "referral", `tx:${tx.id}`);
  await addCoins(referrer.id, COIN_RULES.referral, "referral", `tx:${tx.id}`);
  const name = buyer.displayName || "Someone you invited";
  await notify(buyer.id, "referral", `${money} of booth credit for you`, `Thanks for joining through ${referrer.displayName || "a friend"}'s link. Plus ${COIN_RULES.referral} arcade coins. Spend the credit on any claim, takeover, boost or banner.`).catch(() => {});
  await notify(referrer.id, "referral", `${name} made their first purchase`, `You both got ${money} in booth credit and ${COIN_RULES.referral} coins for it.`).catch(() => {});
  await sendTemplate("referral_earned", referrer.email, {
    subject: `You earned ${money} in booth credit`,
    fallbackText: `${name} joined with your link and made their first purchase. You each got ${money} in booth credit.`,
    name, amount: money,
  }, { channel: "system", userId: referrer.id }).catch(() => {});
}

/** That payment was refunded in full or disputed: take both credits back (never below zero) so a later real payment can earn it again. */
export async function revokeReferral(txId: string): Promise<boolean> {
  await ensureMigrated();
  const [buyer] = await db.update(schema.users).set({ referralPaidAt: null, referralTxId: null }).where(eq(schema.users.referralTxId, txId)).returning();
  if (!buyer) return false;
  const back = sql`max(0, ${schema.users.creditCents} - ${REFERRAL_CREDIT_CENTS})`;
  await db.update(schema.users).set({ creditCents: back }).where(eq(schema.users.id, buyer.id));
  if (buyer.referredBy) await db.update(schema.users).set({ creditCents: back }).where(eq(schema.users.id, buyer.referredBy));
  return true;
}
