"use client";
import DivinityCheckoutFrame from "@/components/DivinityCheckoutFrame";

export function CheckoutClient({ txId, url, sessionId, boothId }: { txId: string; url: string; sessionId: string; boothId: number }) {
  return <DivinityCheckoutFrame checkoutUrl={url} sessionId={sessionId} confirmPath="/api/checkout/confirm" confirmBody={{ txId }} onCancel={() => { window.location.href = boothId ? `/?booth=${boothId}` : "/"; }} />;
}
