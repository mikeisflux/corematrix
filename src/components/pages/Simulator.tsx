"use client";
import { useEffect, useState } from "react";

const NS = "divinitycoin-checkout";

export function Simulator({ reference, amount, kind, success }: { reference: string; amount: string; kind: "payment" | "setup"; success: string }) {
  const sessionId = kind === "setup" ? `cs_test_setup_${reference}` : `cs_test_${reference}`;
  const [embedded, setEmbedded] = useState(false);
  const [busy, setBusy] = useState<"ok" | "fail" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const post = (m: Record<string, unknown>) => { if (window.parent !== window) window.parent.postMessage({ namespace: NS, sessionId, ...m }, "*"); };
  useEffect(() => { setEmbedded(window.parent !== window); post({ type: "ready" }); post({ type: "resize", height: 420 }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function go(outcome: "ok" | "fail") {
    setBusy(outcome);
    setMsg(null);
    const r = await fetch("/api/checkout/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference, amount, kind, outcome: outcome === "fail" ? "failed" : "succeeded" }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(d.error || "Simulation failed"); setBusy(null); return; }
    const status = outcome === "fail" ? (kind === "setup" ? "canceled" : "failed") : "complete";
    if (embedded) post({ type: "complete", status });
    else window.location.href = outcome === "ok" ? success : `${success}${success.includes("?") ? "&" : "?"}cancelled=1`;
    setMsg(outcome === "ok" ? "Simulated payment posted to the webhook." : "Simulated decline posted.");
  }

  return (
    <div className="min-h-dvh bg-white p-6 text-slate-900" style={{ fontFamily: "system-ui, sans-serif" }}>
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-600">DivinityCoin · test mode</div>
        <h1 className="mt-1 text-xl font-bold">{kind === "setup" ? "Save a card" : `Pay $${Number(amount).toFixed(2)}`}</h1>
        <p className="mt-1 text-sm text-slate-500">This simulator replaces the hosted checkout. Nothing is charged; a signed webhook is posted to the site exactly like the real thing.</p>
        <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2 text-sm">
          <input readOnly className="rounded-lg border border-slate-300 px-3 py-2 font-mono" value="4242 4242 4242 4242" />
          <input readOnly className="w-16 rounded-lg border border-slate-300 px-2 py-2 font-mono" value="12/34" />
          <input readOnly className="w-14 rounded-lg border border-slate-300 px-2 py-2 font-mono" value="123" />
        </div>
        <div className="mt-4 flex gap-2">
          <button disabled={!!busy} onClick={() => go("ok")} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy === "ok" ? "Posting…" : kind === "setup" ? "Save card" : "Pay now"}</button>
          <button disabled={!!busy} onClick={() => go("fail")} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{busy === "fail" ? "Posting…" : "Simulate decline"}</button>
        </div>
        {msg && <p className="mt-3 text-sm text-slate-600">{msg}</p>}
        <p className="mt-4 font-mono text-[11px] text-slate-400">ref {reference} · {sessionId}</p>
      </div>
    </div>
  );
}
