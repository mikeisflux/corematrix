"use client";
import { useEffect, useState } from "react";
import { api, track, useCity } from "@/lib/city/store";
import { BILLBOARD_SLOTS, formatMoney } from "@/lib/config";
import { PanelHeader, SignIn } from "./common";

interface B { id: string; slot: string; headline: string; body: string | null; website: string | null; color: string; plotId: number | null; seen: number; opens: number; clicks: number; startsAt: number; endsAt: number }

export function BillboardsPanel() {
  const me = useCity((s) => s.me);
  const myPlots = useCity((s) => s.myPlots);
  const live = useCity((s) => s.billboards);
  const [mine, setMine] = useState<B[]>([]);
  const [form, setForm] = useState({ slot: "block" as "block" | "airship", block: 0, weeks: 1, headline: "", body: "", website: "", color: "#111827", plotId: null as number | null });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (me) api<{ billboards: B[] }>("/api/billboards?mine=1").then((d) => setMine(d.billboards));
  }, [me]);
  useEffect(() => {
    live.forEach((b) => track({ kind: "billboard", id: b.id, metric: "seen" }));
  }, [live]);
  const price = (form.slot === "airship" ? BILLBOARD_SLOTS.airship.priceCentsPerWeek : BILLBOARD_SLOTS.block.priceCentsPerWeek) * form.weeks;
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ url: string }>("/api/checkout", { method: "POST", body: JSON.stringify({ kind: "billboard", ...form }) });
      window.location.href = r.url;
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <>
      <PanelHeader title="Billboards" sub="Self-serve ads in the city, with real numbers" />
      <div className="space-y-3 p-3">
        {live.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">On air now</div>
            <ul className="mt-1 space-y-1">
              {live.map((b) => (
                <li key={b.id} className="flex items-center gap-2 rounded-xl p-2" style={{ background: `${b.color}33` }}>
                  <div className="min-w-0 flex-1"><div className="truncate font-semibold">{b.headline}</div>{b.body && <div className="truncate text-xs text-slate-300">{b.body}</div>}</div>
                  {b.website && <a className="btn-ghost text-xs" href={b.website} target="_blank" rel="noopener" onClick={() => track({ kind: "billboard", id: b.id, metric: "clicks" })}>Visit</a>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs text-slate-300">
          <b className="text-white">Two placements.</b> {BILLBOARD_SLOTS.block.name} ({formatMoney(BILLBOARD_SLOTS.block.priceCentsPerWeek)}/wk): {BILLBOARD_SLOTS.block.blurb} {BILLBOARD_SLOTS.airship.name} ({formatMoney(BILLBOARD_SLOTS.airship.priceCentsPerWeek)}/wk): {BILLBOARD_SLOTS.airship.blurb} You get times seen, opens and clicks, live.
        </div>
        {me ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">Placement</label><select className="input" value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value as "block" | "airship" })}><option value="block">Block billboard</option><option value="airship">Airship banner</option></select></div>
              <div><label className="label">Weeks</label><select className="input" value={form.weeks} onChange={(e) => setForm({ ...form, weeks: Number(e.target.value) })}>{[1, 2, 4, 8].map((w) => <option key={w} value={w}>{w}</option>)}</select></div>
              {form.slot === "block" && <div><label className="label">Block</label><input className="input" type="number" min={0} max={40} value={form.block} onChange={(e) => setForm({ ...form, block: Number(e.target.value) })} /></div>}
              <div><label className="label">Color</label><input type="color" className="h-10 w-full rounded-xl bg-transparent" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div>
            </div>
            <input className="input" maxLength={48} placeholder="Headline (48 chars)" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} />
            <input className="input" maxLength={140} placeholder="One line of body copy" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            <input className="input" placeholder="https://your-link" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            {myPlots.length > 0 && (
              <select className="input" value={form.plotId ?? ""} onChange={(e) => setForm({ ...form, plotId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Use text only</option>
                {myPlots.map((p) => <option key={p.id} value={p.id}>Use logo from {p.name} (#{p.id})</option>)}
              </select>
            )}
            <button className="btn-primary w-full" disabled={busy || !form.headline.trim()} onClick={submit}>Book for {formatMoney(price)} →</button>
            {err && <p className="text-xs text-rose-400">{err}</p>}
            {mine.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Your campaigns</div>
                <table className="mt-1 w-full text-xs">
                  <thead><tr className="text-left text-[10px] uppercase text-slate-500"><th>Headline</th><th className="text-right">Seen</th><th className="text-right">Opens</th><th className="text-right">Clicks</th></tr></thead>
                  <tbody>{mine.map((b) => <tr key={b.id} className="border-t border-white/8"><td className="py-1 truncate max-w-[150px]">{b.headline}<div className="text-[10px] text-slate-500">{b.slot} · {b.endsAt > Date.now() ? "live" : "ended"}</div></td><td className="mono text-right">{b.seen}</td><td className="mono text-right">{b.opens}</td><td className="mono text-right">{b.clicks}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <SignIn note="Sign in to book a billboard." />
        )}
      </div>
    </>
  );
}
