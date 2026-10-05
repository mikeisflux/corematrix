import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Shell } from "@/components/pages/Shell";
import { currentUser, requestOrigin } from "@/lib/auth";
import { db, ensureMigrated, schema } from "@/lib/db";
import { describeTx, startCheckout, paymentsMode } from "@/lib/payments";
import { formatMoney } from "@/lib/config";
import { CheckoutClient } from "@/components/pages/CheckoutClient";

export const metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ txId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { txId } = await params;
  const sp = await searchParams;
  await ensureMigrated();
  const user = await currentUser();
  if (!user) redirect(`/app/login?next=/app/checkout/${txId}`);
  const [tx] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, txId)).limit(1);
  if (!tx || tx.buyerId !== user.id) redirect("/");
  if (tx.status === "paid") redirect(`/app/checkout/done?tx=${tx.id}`);
  const mode = await paymentsMode();
  let embed: { url: string; sessionId: string } | null = null;
  let error: string | null = null;
  let external: string | null = null;
  if (tx.status === "pending") {
    if (mode === "unconfigured") error = "Payments are not configured yet. The operator needs to add the DivinityCoin API key in Admin → Settings, or turn on test mode.";
    else {
      try {
        const r = await startCheckout(tx.id, { embed: true, origin: await requestOrigin() });
        if (r.sessionId) embed = { url: r.url, sessionId: r.sessionId }; else external = r.url;
      } catch (e) { error = (e as Error).message; }
    }
  } else error = `This transaction is ${tx.status}. Start again from the hall.`;
  if (external) redirect(external);
  return (
    <Shell>
      <div className="mx-auto max-w-2xl">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">Checkout</div>
        <h1 className="mt-1 text-3xl font-bold">{describeTx(tx)}</h1>
        <p className="mt-1 text-slate-300">{tx.kind === "tier" ? `${formatMoney(tx.amountCents)} every 30 days. Save a card to start; cancel any time.` : `${formatMoney(tx.amountCents)}, charged once.`}</p>
        {sp.cancelled && <p className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">Checkout was cancelled. Nothing was charged. You can try again below.</p>}
        <div className="mt-6">
          {error ? <div className="rounded-xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm">{error}</div> : embed ? <CheckoutClient txId={tx.id} url={embed.url} sessionId={embed.sessionId} boothId={tx.boothId} /> : null}
        </div>
      </div>
    </Shell>
  );
}
