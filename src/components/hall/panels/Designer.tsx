"use client";
import { useEffect, useMemo, useState } from "react";
import { api, useHall } from "@/lib/hall/store";
import { BANNER_STYLES, CATEGORIES, formatMoney, splitTakeover, BOOTH_SIZES, ZONES } from "@/lib/config";
import { boothSpace } from "@/lib/hall/layout";
import { SignIn } from "./common";

const PALETTE = ["#3a86ff", "#e63946", "#2a9d8f", "#f4a261", "#8338ec", "#ff006e", "#06d6a0", "#ffd166", "#264653", "#f8f9fa", "#1b1b1f", "#9b5de5"];
const CLOTHS = ["#111827", "#7f1d1d", "#1e3a8a", "#065f46", "#4c1d95", "#9a3412", "#f8fafc", "#3f3f46"];
const STYLE_LABEL: Record<string, string> = { classic: "Classic", neon: "Neon", comic: "Comic", minimal: "Minimal", retro: "Retro" };

interface Props { boothId: number; mode: "claim" | "takeover"; initial?: Partial<Draft> }
interface Draft { name: string; tagline: string; description: string; website: string; logoUrl: string; color: string; accent: string; style: string; cloth: string; category: string }

export function Designer({ boothId, mode, initial }: Props) {
  const me = useHall((s) => s.me);
  const booths = useHall((s) => s.booths);
  const setPreview = useHall((s) => s.setPreview);
  const setFlyTo = useHall((s) => s.setFlyTo);
  const space = boothSpace(boothId)!;
  const target = booths.get(boothId);
  const [d, setD] = useState<Draft>({ name: "", tagline: "", description: "", website: "", logoUrl: "", color: PALETTE[0], accent: "#ffffff", style: "classic", cloth: "#111827", category: space.kind === "artist" ? "art" : "comics", ...initial });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [useCredit, setUseCredit] = useState(true);

  const price = mode === "claim" ? space.priceCents : splitTakeover(target?.valueCents ?? 0).price;
  const credit = useCredit ? Math.min(me?.creditCents ?? 0, price) : 0;
  const rank = useMemo(() => Array.from(booths.values()).filter((p) => p.id !== boothId && p.valueCents > price).length + 1, [booths, price, boothId]);

  useEffect(() => {
    if (mode === "claim") setPreview({ boothId, color: d.color, style: d.style, cloth: d.cloth, name: d.name });
    return () => setPreview(null);
  }, [d.color, d.style, d.cloth, d.name, boothId, mode, setPreview]);
  useEffect(() => { setFlyTo(boothId); }, [boothId, setFlyTo]);

  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    setD((x) => ({ ...x, logoUrl: j.url }));
  };
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ url: string }>("/api/checkout", { method: "POST", body: JSON.stringify({ kind: mode, boothId, draft: d, useCredit }) });
      window.location.href = r.url;
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const sizeDef = BOOTH_SIZES[space.size];

  return (
    <div className="space-y-3 p-3">
      <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-xs">
        {mode === "claim" ? (<><b>{sizeDef.name} · {ZONES[space.zone].name}.</b> {sizeDef.blurb} {ZONES[space.zone].blurb} Lands at <b className="text-white">#{rank}</b> on the leaderboard.</>)
          : (<><b>Takeover.</b> Pay 1.25× the current value ({formatMoney(target?.valueCents ?? 0)}) and the booth is yours. The seller gets their money back plus a profit.</>)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2"><label className="label">Exhibitor name</label><input className="input" maxLength={40} placeholder={space.kind === "artist" ? "Your artist name" : "Studio, shop or publisher"} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
        <div className="col-span-2"><label className="label">Tagline (goes on the banner)</label><input className="input" maxLength={90} placeholder="What you make, in one line" value={d.tagline} onChange={(e) => setD({ ...d, tagline: e.target.value })} /></div>
        <div className="col-span-2"><label className="label">Website · opens in a new tab when visitors click your banner</label><input className="input" placeholder="https://" value={d.website} onChange={(e) => setD({ ...d, website: e.target.value })} /></div>
        <div className="col-span-2">
          <label className="label">Logo</label>
          <div className="flex items-center gap-2">
            <img src={d.logoUrl || `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' rx='10' fill='${d.color}'/><text x='32' y='36' font-size='26' font-family='sans-serif' font-weight='700' fill='white' text-anchor='middle'>${(d.name || "?").slice(0, 2).toUpperCase()}</text></svg>`)}`} alt="" className="h-12 w-12 rounded-lg bg-white/10 object-cover" />
            <label className="btn-ghost cursor-pointer text-xs">Upload<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0]).catch((er) => setErr(er.message))} /></label>
            <input className="input text-xs" placeholder="or paste an image URL" value={d.logoUrl.startsWith("data:") ? "" : d.logoUrl} onChange={(e) => setD({ ...d, logoUrl: e.target.value })} />
          </div>
        </div>
      </div>
      <div>
        <label className="label">Banner color</label>
        <div className="flex flex-wrap gap-1.5">
          {PALETTE.map((c) => <button key={c} onClick={() => setD({ ...d, color: c })} className={`h-7 w-7 rounded-lg border-2 ${d.color === c ? "border-white" : "border-transparent"}`} style={{ background: c }} aria-label={c} />)}
          <input type="color" value={d.color} onChange={(e) => setD({ ...d, color: e.target.value })} className="h-7 w-7 cursor-pointer rounded-lg bg-transparent" />
        </div>
      </div>
      <div>
        <label className="label">Accent</label>
        <div className="flex flex-wrap gap-1.5">
          {["#ffffff", "#ffd166", "#00f5ff", "#ff2bd6", "#5ee6c3", "#111827"].map((c) => <button key={c} onClick={() => setD({ ...d, accent: c })} className={`h-7 w-7 rounded-lg border-2 ${d.accent === c ? "border-white" : "border-transparent"}`} style={{ background: c }} aria-label={c} />)}
        </div>
      </div>
      <div>
        <label className="label">Banner style</label>
        <div className="grid grid-cols-5 gap-1">
          {BANNER_STYLES.map((o) => <button key={o} onClick={() => setD({ ...d, style: o })} className={`rounded-lg px-1 py-1.5 text-[11px] ${d.style === o ? "bg-amber-300 text-slate-950 font-semibold" : "bg-white/5 hover:bg-white/10"}`}>{STYLE_LABEL[o]}</button>)}
        </div>
      </div>
      <div>
        <label className="label">Table cloth & drapes</label>
        <div className="flex flex-wrap gap-1.5">{CLOTHS.map((c) => <button key={c} onClick={() => setD({ ...d, cloth: c })} className={`h-7 w-7 rounded-lg border-2 ${d.cloth === c ? "border-white" : "border-transparent"}`} style={{ background: c }} aria-label={c} />)}</div>
      </div>
      <div>
        <label className="label">Category</label>
        <select className="input" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })}>
          {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.name} — {v.blurb}</option>)}
        </select>
      </div>
      <div><label className="label">About (optional)</label><textarea className="input" rows={3} maxLength={600} placeholder="Tell visitors what they'll find at your table." value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></div>
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <div className="flex items-center justify-between text-sm"><span className="text-slate-300">{mode === "claim" ? `${sizeDef.short} · ${ZONES[space.zone].name}` : "Takeover price"}</span><span className="mono font-bold">{formatMoney(price)}</span></div>
        {me && me.creditCents > 0 && (
          <label className="mt-2 flex items-center justify-between text-xs text-slate-300"><span className="flex items-center gap-2"><input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} />Use my {formatMoney(me.creditCents)} credit</span><span className="mono">−{formatMoney(credit)}</span></label>
        )}
        <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2"><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total</span><span className="mono text-xl font-bold text-amber-300">{formatMoney(price - credit)}</span></div>
      </div>
      {me ? <button className="btn-primary w-full" disabled={busy || !d.name.trim()} onClick={submit}>{busy ? "Opening checkout…" : mode === "claim" ? "Continue to payment →" : "Take over this booth →"}</button> : <SignIn note="Sign in to finish. Your setup is kept on this page." />}
      {err && <p className="text-xs text-rose-400">{err}</p>}
      <p className="text-[11px] text-slate-500">Edit your name, banner, logo, link and colors any time for free. Value only grows: boost it later, or let takeovers pay you. Full refund within 24 hours if nobody has interacted with your booth.</p>
    </div>
  );
}
