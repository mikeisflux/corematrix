import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, paymentsMode } from "@/lib/payments";
import { settle } from "@/lib/economy";
import { markCanceled, markPastDue, plotForSubscription, renewPlan } from "@/lib/subscriptions";

export async function POST(req: Request) {
  if (paymentsMode !== "stripe") return NextResponse.json({ ok: true, sandbox: true });
  const sig = req.headers.get("stripe-signature") ?? "";
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (e) {
    return NextResponse.json({ error: `Webhook signature failed: ${(e as Error).message}` }, { status: 400 });
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    const txId = session.metadata?.txId ?? session.client_reference_id;
    if (txId && session.payment_status === "paid") {
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      await settle(txId, "stripe", subId ?? session.id);
    }
  } else if (event.type === "invoice.paid") {
    const inv = event.data.object as Stripe.Invoice;
    const details = inv.parent?.subscription_details;
    const subId = typeof details?.subscription === "string" ? details.subscription : details?.subscription?.id;
    if (subId && inv.billing_reason === "subscription_cycle") {
      const plot = await plotForSubscription(subId);
      if (plot) await renewPlan(plot.id, inv.amount_paid ?? 0, "stripe", inv.id);
    }
  } else if (event.type === "invoice.payment_failed") {
    const inv = event.data.object as Stripe.Invoice;
    const details = inv.parent?.subscription_details;
    const subId = typeof details?.subscription === "string" ? details.subscription : details?.subscription?.id;
    if (subId) await markPastDue(subId);
  } else if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    await markCanceled(sub.id);
  }
  return NextResponse.json({ received: true });
}
