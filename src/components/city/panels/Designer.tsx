"use client";
import { useEffect, useMemo, useState } from "react";
import { api, useCity } from "@/lib/city/store";
import { BUILDING_SHAPES, BUILDING_STYLES, DISTRICTS, formatMoney, MAX_FLOORS, PRICE_PER_FLOOR_CENTS, ROOF_STYLES, splitTakeover, zoneFor } from "@/lib/config";
import { SignIn } from "./common";

const PALETTE = ["#3a86ff", "#e63946", "#2a9d8f", "#f4a261", "#8338ec", "#ff006e", "#06d6a0", "#ffd166", "#264653", "#f8f9fa", "#1b1b1f", "#9b5de5"];
const SHAPE_LABEL: Record<string, string> = { tower: "Tower", stepped: "Stepped", twin: "Twin", cantilever: "Cantilever", spire: "Spire" };
const STYLE_LABEL: Record<string, string> = { modern: "Paired", glass: "Glass", brick: "Brick", neon: "Neon", deco: "Deco" };

interface Props {
  plotId: number;
  mode: "claim" | "takeover";
  initial?: Partial<Draft>;
}
interface Draft {
  name: string;
  tagline: string;
  description: string;
  website: string;
  logoUrl: string;
  color: string;
  shape: string;
  style: string;
  roof: string;
  district: string;
  floors: number;
}

export function Designer({ plotId, mode, initial }: Props) {
  const me = useCity((s) => s.me);
  const plots = useCity((s) => s.plots);
  const setPreview = useCity((s) => s.setPreview);
  const setFlyTo = useCity((s) => s.setFlyTo);
  const zone = zoneFor(plotId);
  const target = plots.get(plotId);
  const [d, setD] = useState<Draft>({
    name: "",
    tagline: "",
    description: "",
    website: "",
    logoUrl: "",
    color: PALETTE[0],
    shape: "tower",
    style: "modern",
    roof: "flat",
    district: "downtown",
    floors: Math.max(zone.minFloors, 10),
    ...initial,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [useCredit, setUseCredit] = useState(true);

  const price = mode === "claim" ? d.floors * PRICE_PER_FLOOR_CENTS : splitTakeover(target?.valueCents ?? 0).price;
  const credit = useCredit ? Math.min(me?.creditCents ?? 0, price) : 0;
  const rank = useMemo(() => {
    const v = mode === "claim" ? price : price;
    return Array.from(plots.values()).filter((p) => p.id !== plotId && p.valueCents > v).length + 1;
  }, [plots, price, plotId, mode]);

  useEffect(() => {
    if (mode === "claim") setPreview({ plotId, floors: d.floors, color: d.color, shape: d.shape, style: d.style, roof: d.roof });
    return () => setPreview(null);
  }, [d.floors, d.color, d.shape, d.style, d.roof, plotId, mode, setPreview]);
  useEffect(() => {
    setFlyTo(plotId);
  }, [plotId, setFlyTo]);

  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    setD((x) => ({ ...x, logoUrl: j.url }));
  };

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ url: string }>("/api/checkout", { method: "POST", body: JSON.stringify({ kind: mode, plotId, draft: d, useCredit }) });
      window.location.href = r.url;
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 p-3">
      <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-xs">
        {mode === "claim" ? (
          <>
            <b>{zone.name}.</b> {zone.blurb} {formatMoney(PRICE_PER_FLOOR_CENTS)} per floor.
          </>
        ) : (
          <>
            <b>Takeover.</b> Pay 1.25× the current value ({formatMoney(target?.valueCents ?? 0)}) and the building is yours. The seller gets their money back plus a profit.
          </>
        )}
      </div>

      {mode === "claim" && (
        <div>
          <div className="flex items-end justify-between">
            <label className="label">Height · {d.floors} floors</label>
            <span className="text-[11px] text-slate-400">Lands at <b className="text-white">#{rank}</b> on the leaderboard</span>
          </div>
          <input type="range" min={zone.minFloors} max={MAX_FLOORS} value={d.floors} onChange={(e) => setD({ ...d, floors: Number(e.target.value) })} className="w-full accent-amber-300" />
          <div className="mt-1 flex gap-1">
            {[zone.minFloors, 10, 25, 50, 100, 120].filter((f, i, a) => f >= zone.minFloors && a.indexOf(f) === i).map((f) => (
              <button key={f} onClick={() => setD({ ...d, floors: f })} className={`rounded-lg px-2 py-1 text-[11px] ${d.floors === f ? "bg-amber-300 text-slate-950" : "bg-white/5 hover:bg-white/10"}`}>{f}</button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="label">Building name</label>
          <input className="input" maxLength={40} placeholder="Acme Tower" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </div>
        <div className="col-span-2">
          <label className="label">Tagline</label>
          <input className="input" maxLength={90} placeholder="What you do, in one line" value={d.tagline} onChange={(e) => setD({ ...d, tagline: e.target.value })} />
        </div>
        <div className="col-span-2">
          <label className="label">Website</label>
          <input className="input" placeholder="https://" value={d.website} onChange={(e) => setD({ ...d, website: e.target.value })} />
        </div>
        <div className="col-span-2">
          <label className="label">Logo</label>
          <div className="flex items-center gap-2">
            <img src={d.logoUrl || `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' rx='10' fill='${d.color}'/><text x='32' y='36' font-size='26' font-family='sans-serif' font-weight='700' fill='white' text-anchor='middle'>${(d.name || "?").slice(0, 2).toUpperCase()}</text></svg>`)}`} alt="" className="h-12 w-12 rounded-lg bg-white/10 object-cover" />
            <label className="btn-ghost cursor-pointer text-xs">
              Upload
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0]).catch((er) => setErr(er.message))} />
            </label>
            <input className="input text-xs" placeholder="or paste an image URL" value={d.logoUrl.startsWith("data:") ? "" : d.logoUrl} onChange={(e) => setD({ ...d, logoUrl: e.target.value })} />
          </div>
        </div>
      </div>

      <div>
        <label className="label">Color</label>
        <div className="flex flex-wrap gap-1.5">
          {PALETTE.map((c) => (
            <button key={c} onClick={() => setD({ ...d, color: c })} className={`h-7 w-7 rounded-lg border-2 ${d.color === c ? "border-white" : "border-transparent"}`} style={{ background: c }} aria-label={c} />
          ))}
          <input type="color" value={d.color} onChange={(e) => setD({ ...d, color: e.target.value })} className="h-7 w-7 cursor-pointer rounded-lg bg-transparent" />
        </div>
      </div>

      <Choice label="Shape" value={d.shape} options={BUILDING_SHAPES} labels={SHAPE_LABEL} onChange={(shape) => setD({ ...d, shape })} />
      <Choice label="Windows" value={d.style} options={BUILDING_STYLES} labels={STYLE_LABEL} onChange={(style) => setD({ ...d, style })} />
      <Choice label="Roof" value={d.roof} options={ROOF_STYLES} onChange={(roof) => setD({ ...d, roof })} />
      <div>
        <label className="label">District</label>
        <select className="input" value={d.district} onChange={(e) => setD({ ...d, district: e.target.value })}>
          {Object.entries(DISTRICTS).map(([k, v]) => <option key={k} value={k}>{v.name} — {v.blurb}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Description (optional)</label>
        <textarea className="input" rows={3} maxLength={600} placeholder="Tell visitors what they'll find on your site." value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-300">{mode === "claim" ? `${d.floors} floors × ${formatMoney(PRICE_PER_FLOOR_CENTS)}` : "Takeover price"}</span>
          <span className="mono font-bold">{formatMoney(price)}</span>
        </div>
        {me && me.creditCents > 0 && (
          <label className="mt-2 flex items-center justify-between text-xs text-slate-300">
            <span className="flex items-center gap-2"><input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} />Use my {formatMoney(me.creditCents)} credit</span>
            <span className="mono">−{formatMoney(credit)}</span>
          </label>
        )}
        <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total</span>
          <span className="mono text-xl font-bold text-amber-300">{formatMoney(price - credit)}</span>
        </div>
      </div>

      {me ? (
        <button className="btn-primary w-full" disabled={busy || !d.name.trim()} onClick={submit}>{busy ? "Opening checkout…" : mode === "claim" ? "Continue to payment →" : "Take over this building →"}</button>
      ) : (
        <SignIn note="Sign in to finish. Your design is kept on this page." />
      )}
      {err && <p className="text-xs text-rose-400">{err}</p>}
      <p className="text-[11px] text-slate-500">
        You can edit name, logo, link, colors and description any time for free. Height only grows: boost it later, or let takeovers pay you. Full refund within 24 hours if nobody has interacted with your building.
      </p>
    </div>
  );
}

function Choice<T extends string>({ label, value, options, labels, onChange }: { label: string; value: string; options: readonly T[]; labels?: Record<string, string>; onChange: (v: T) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="grid grid-cols-5 gap-1">
        {options.map((o) => (
          <button key={o} onClick={() => onChange(o)} className={`rounded-lg px-1 py-1.5 text-[11px] capitalize ${value === o ? "bg-amber-300 text-slate-950 font-semibold" : "bg-white/5 hover:bg-white/10"}`}>{labels?.[o] ?? o}</button>
        ))}
      </div>
    </div>
  );
}
