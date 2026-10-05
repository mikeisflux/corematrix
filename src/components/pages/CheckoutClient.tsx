"use client";
import DivinityCheckoutFrame from "@/components/DivinityCheckoutFrame";

export function CheckoutClient({ txId, url, sessionId, plotId }: { txId: string; url: string; sessionId: string; plotId: number }) {
  return <DivinityCheckoutFrame checkoutUrl={url} sessionId={sessionId} confirmPath="/api/checkout/confirm" confirmBody={{ txId }} onCancel={() => { window.location.href = plotId ? `/?plot=${plotId}` : "/"; }} />;
}
