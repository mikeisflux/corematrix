import Stripe from "stripe";
import { SITE_NAME, SITE_URL } from "@/lib/config";
import { settle, type Tx } from "@/lib/economy";
import { TIERS, type Tier } from "@/lib/config";

export const paymentsMode: "sandbox" | "stripe" = process.env.STRIPE_SECRET_KEY ? "stripe" : "sandbox";

let stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!stripe) stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return stripe;
}

/**
 * Returns a URL to send the buyer to. In sandbox mode the transaction settles
 * immediately and we return the success URL.
 */
export async function checkoutUrl(tx: Tx, email: string, description: string): Promise<string> {
  const success = `${SITE_URL}/checkout/done?tx=${tx.id}`;
  if (tx.amountCents <= 0) {
    await settle(tx.id, "sandbox", "credit");
    return success;
  }
  if (paymentsMode === "sandbox") {
    await settle(tx.id, "sandbox", "dev");
    return success;
  }
  if (tx.kind === "tier") {
    const tier = (JSON.parse(tx.meta ?? "{}") as { tier?: Tier }).tier ?? "pro";
    const sub = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      client_reference_id: tx.id,
      metadata: { txId: tx.id, plotId: String(tx.plotId), kind: "tier", tier },
      subscription_data: { metadata: { txId: tx.id, plotId: String(tx.plotId), tier } },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: TIERS[tier].priceCents,
            recurring: { interval: "day", interval_count: 30 },
            product_data: { name: `${SITE_NAME} · ${TIERS[tier].name} plan`, description: `Plot #${tx.plotId} · renews every 30 days` },
          },
        },
      ],
      success_url: success,
      cancel_url: `${SITE_URL}/dashboard?plot=${tx.plotId}&cancelled=1`,
    });
    return sub.url!;
  }
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    customer_email: email,
    client_reference_id: tx.id,
    metadata: { txId: tx.id, plotId: String(tx.plotId), kind: tx.kind },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: tx.amountCents,
          product_data: { name: `${SITE_NAME} · ${description}`, description: `Plot #${tx.plotId}` },
        },
      },
    ],
    success_url: success,
    cancel_url: `${SITE_URL}/plot/${tx.plotId}?cancelled=1`,
  });
  return session.url!;
}
