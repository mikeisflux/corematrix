"use client";
import { useState } from "react";
import { api, useCity } from "@/lib/city/store";

export function PanelHeader({ title, sub, onBack }: { title: string; sub?: string; onBack?: () => void }) {
  const setPanel = useCity((s) => s.setPanel);
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-white/8 bg-[var(--panel)] px-3 py-2.5">
      {onBack && <button onClick={onBack} className="rounded-lg px-2 py-1 text-slate-300 hover:bg-white/10">←</button>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-bold uppercase tracking-[0.18em]">{title}</div>
        {sub && <div className="truncate text-[11px] text-slate-400">{sub}</div>}
      </div>
      <button onClick={() => setPanel("none")} className="rounded-lg px-2 py-1 text-slate-300 hover:bg-white/10" aria-label="Close">✕</button>
    </div>
  );
}

/** Inline magic-link sign-in. Shown inside any flow that needs an account. */
export function SignIn({ next, note }: { next?: string; note?: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<null | { devLink?: string }>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const ref = typeof window !== "undefined" ? localStorage.getItem("aoc_ref") ?? undefined : undefined;
      const r = await api<{ devLink?: string }>("/api/auth/request", { method: "POST", body: JSON.stringify({ email, next: next ?? window.location.pathname, ref }) });
      setSent(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (sent) {
    return (
      <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm">
        <b>Check your email.</b> We sent a sign-in link to {email}.
        {sent.devLink && (
          <div className="mt-2 text-xs text-slate-300">
            Dev mode (no email provider configured): <a className="text-amber-300 underline" href={sent.devLink}>open the sign-in link</a>
          </div>
        )}
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      {note && <p className="text-xs text-slate-300">{note}</p>}
      <input className="input" type="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Email me a sign-in link"}</button>
      {err && <p className="text-xs text-rose-400">{err}</p>}
      <p className="text-[11px] text-slate-500">No password. New accounts start with free arcade coins.</p>
    </form>
  );
}

export function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="kpi">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mono text-lg font-bold ${accent ? "text-amber-300" : ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}
