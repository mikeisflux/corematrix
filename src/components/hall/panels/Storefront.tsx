"use client";
/**
 * The storefront: what you see when you click an occupied booth on the floor.
 * Hero art, the exhibitor's links, every comic cover on their table as a
 * gallery with a lightbox, who is at the booth right now, and the actions.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { track, useHall, type HallBooth } from "@/lib/hall/store";
import { CATEGORIES, formatCount, formatMoney, splitTakeover, BOOTH_SIZES, ZONES } from "@/lib/config";
import { boothSpace } from "@/lib/hall/layout";
import { live } from "@/lib/hall/live";
import { openSite } from "../Booth";
import { openDm } from "../Avatar";
import { timeAgo } from "@/lib/util";

export interface StorefrontDetail {
  booth: { isOwner: boolean; ownerId?: string | null; description: string | null; claimedAt: number | null; salesCount: number; artstation?: string | null; deviantart?: string | null; instagram?: string | null; xUrl?: string | null; facebook?: string | null; globalcomix?: string | null; art?: Record<string, number>; artLinks?: Record<string, string> };
  totals: { views: number; clicks: number; impressions: number; uniques: number };
  history: Array<{ id: string; kind: string; amountCents: number; valueAfter: number; createdAt: number }>;
}

const LINKS: Array<{ key: "website" | "globalcomix" | "artstation" | "deviantart" | "instagram" | "facebook" | "xUrl"; label: string; glyph: string; cls: string }> = [
  { key: "website", label: "Website", glyph: "🌐", cls: "bg-amber-300 text-slate-950 hover:bg-amber-200" },
  { key: "globalcomix", label: "GlobalComix", glyph: "GC", cls: "bg-[#ff4d4d]/15 text-[#ff9c9c] hover:bg-[#ff4d4d]/25" },
  { key: "artstation", label: "ArtStation", glyph: "A", cls: "bg-[#13aff0]/20 text-[#7fd4ff] hover:bg-[#13aff0]/30" },
  { key: "deviantart", label: "DeviantArt", glyph: "DA", cls: "bg-[#00e59b]/15 text-[#5ef0c0] hover:bg-[#00e59b]/25" },
  { key: "instagram", label: "Instagram", glyph: "◎", cls: "bg-[#e1306c]/15 text-[#ff8ab0] hover:bg-[#e1306c]/25" },
  { key: "facebook", label: "Facebook", glyph: "f", cls: "bg-[#1877f2]/20 text-[#8ab8ff] hover:bg-[#1877f2]/30" },
  { key: "xUrl", label: "X", glyph: "𝕏", cls: "bg-white/10 text-white hover:bg-white/20" },
];

export function Storefront({ id, booth, detail, rank, onTakeover }: { id: number; booth: HallBooth; detail: StorefrontDetail | null; rank: number; onTakeover: () => void }) {
  const me = useHall((s) => s.me);
  const mode = useHall((s) => s.mode);
  const setMode = useHall((s) => s.setMode);
  const setFlyTo = useHall((s) => s.setFlyTo);
  const setToast = useHall((s) => s.setToast);
  const [light, setLight] = useState<number | null>(null);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 3000); return () => clearInterval(t); }, []); // who is at the booth refreshes
  const space = boothSpace(id);
  const art = detail?.booth.art ?? booth.art ?? {};
  const buy = detail?.booth.artLinks ?? booth.artLinks ?? {};
  const buyIt = (slot: string) => { const l = buy[slot]; if (!l) return; track({ kind: "clicks", boothId: id, source: "comic" }); window.open(l, "_blank", "noopener"); };
  const url = (slot: string) => `/api/art/${id}/${slot}?v=${art[slot] ?? 0}`;
  const covers = useMemo(() => Object.keys(art).filter((k) => k.startsWith("book:")).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5))), [art]);
  const signage = useMemo(() => ["wide", "portrait", "drape", "tower", "floor", "rollup:0", "rollup:1", "rollup:2", "rollup:3"].filter((k) => art[k]), [art]);
  const hero = art.wide ? url("wide") : art.portrait ? url("portrait") : art["rollup:0"] ? url("rollup:0") : null;
  const links = LINKS.map((l) => ({ ...l, href: (l.key === "website" ? booth.website : (detail?.booth[l.key] ?? booth[l.key])) ?? null })).filter((l) => l.href);
  const isOwner = !!me && !!detail?.booth.isOwner;
  const ownerId = detail?.booth.ownerId ?? null;
  const players = Array.from(live.players.values());
  const ownerHere = ownerId ? players.find((p) => p.uid === ownerId && p.id !== live.me) : undefined;
  const iAmOwner = !!me && me.id === ownerId;
  // people standing around the booth right now (within 30 ft of its centre), me included
  const browsing = space ? players.filter((p) => Math.hypot(p.x - space.x, p.z - space.z) < 30).length : 0;
  const { price, sellerPayout } = splitTakeover(booth.valueCents);
  const open = (href: string, key: string) => { if (key === "website") openSite(id, href, mode === "walk" ? "walk" : "panel"); else { track({ kind: "clicks", boothId: id, source: key }); window.open(href, "_blank", "noopener"); } };
  const tierName = booth.tier === "landmark" ? "Headliner" : booth.tier === "pro" ? "Pro" : null;
  return (
    <div className="relative">
      {/* hero */}
      <div className="relative h-40 overflow-hidden" style={{ background: hero ? undefined : `linear-gradient(135deg, ${booth.color} 0%, #0b0f1a 100%)` }}>
        {hero && <img src={hero} alt="" className="h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0f1a] via-[#0b0f1a]/40 to-transparent" />
        {tierName && <span className="absolute right-3 top-3 rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-950 shadow">{tierName}</span>}
        <div className="absolute bottom-0 left-0 right-0 flex items-end gap-3 p-3">
          <img src={`/api/logo/${id}?v=${booth.logoVersion ?? 0}`} alt="" className="h-16 w-16 shrink-0 rounded-2xl border-2 border-white/15 bg-white/10 object-cover shadow-xl" />
          <div className="min-w-0 flex-1 pb-0.5">
            <h2 className="truncate text-xl font-black leading-tight">{booth.name}</h2>
            {booth.tagline && <p className="truncate text-sm text-slate-200">{booth.tagline}</p>}
            <p className="text-[11px] text-slate-400">{space?.kind === "artist" ? `Table ${space.label}` : `Booth ${space?.label}`}{space ? ` · ${ZONES[space.zone].name} · ${BOOTH_SIZES[space.size]?.short}` : ""} · {CATEGORIES[booth.category]?.name ?? booth.category}</p>
          </div>
        </div>
      </div>
      <div className="space-y-4 p-3">
        {/* links */}
        {links.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {links.map((l) => (
              <button key={l.key} onClick={() => open(l.href!, l.key)} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${l.cls}`}><span className="text-[11px] font-black">{l.glyph}</span>{l.label} ↗</button>
            ))}
          </div>
        ) : isOwner ? <a href={`/app/dashboard?booth=${id}`} className="block rounded-xl border border-dashed border-white/15 p-2 text-center text-xs text-slate-400 hover:border-amber-300/50">Add your website, GlobalComix, ArtStation and DeviantArt links →</a> : null}
        {/* who is here */}
        <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${ownerHere || iAmOwner ? "bg-emerald-300 shadow-[0_0_6px_#5ee6c3]" : "bg-slate-600"}`} />
          <span className="min-w-0 flex-1 truncate text-slate-300">{iAmOwner ? <><b className="text-white">You're on the floor</b> at your own booth{browsing > 1 ? ` · ${browsing - 1} ${browsing === 2 ? "person" : "people"} browsing nearby` : ""}</> : ownerHere ? <><b className="text-white">{ownerHere.n}</b> is at the booth right now{browsing > 1 ? ` · ${browsing} here` : ""}</> : <>The exhibitor isn't on the floor right now{browsing > 0 ? ` · ${browsing} ${browsing === 1 ? "person" : "people"} browsing` : ""}</>}</span>
          {ownerHere && !isOwner && <button onClick={() => openDm(ownerHere.id, ownerHere.n)} className="rounded-lg bg-white/10 px-2 py-1 font-semibold hover:bg-white/20">💬 Say hi</button>}
        </div>
        {/* on the table */}
        {covers.length > 0 && (
          <section>
            <div className="mb-1.5 flex items-baseline justify-between"><h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">On the table</h3><span className="text-[11px] text-slate-500">{covers.length} {covers.length === 1 ? "comic" : "comics"} · tap to view</span></div>
            <div className="-mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 scroll">
              {covers.map((k, i) => (
                <button key={k} onClick={() => setLight(i)} className="group relative w-[108px] shrink-0 snap-start overflow-hidden rounded-lg bg-white/5 shadow-lg transition hover:-translate-y-0.5">
                  <img src={url(k)} alt={`Comic ${i + 1}`} loading="lazy" className="aspect-[2/3] w-full object-cover" />
                  {buy[k] ? <span className="absolute bottom-1 left-1 right-1 rounded bg-amber-300 px-1 py-0.5 text-center text-[10px] font-bold text-slate-950 shadow">🛒 Buy</span> : <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100">#{i + 1}</span>}
                </button>
              ))}
            </div>
          </section>
        )}
        {covers.length === 0 && isOwner && <a href={`/app/dashboard?booth=${id}#books`} className="block rounded-xl border border-dashed border-white/15 p-3 text-center text-xs text-slate-400 hover:border-amber-300/50">Stand comics on your table: upload covers from the dashboard →</a>}
        {/* about */}
        {detail?.booth.description && <section><h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">About</h3><p className="whitespace-pre-line text-sm leading-relaxed text-slate-200">{detail.booth.description}</p></section>}
        {/* signage */}
        {signage.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Signage</h3>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scroll">{signage.map((k) => <img key={k} src={url(k)} alt="" loading="lazy" className="h-14 w-auto max-w-[160px] rounded-md object-cover" />)}</div>
          </section>
        )}
        {/* numbers */}
        <div className="grid grid-cols-3 gap-2">
          {[["Value", formatMoney(booth.valueCents)], ["Rank", `#${rank}`], ["Visits · 7 d", formatCount(detail?.totals.views ?? 0)]].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-white/[0.04] p-2"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{l}</div><div className="mono text-base font-bold">{v}</div></div>
          ))}
        </div>
        {/* actions */}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary" onClick={() => { if (mode !== "walk") setMode("walk"); setFlyTo(id); useHall.getState().setPanel("none"); }}>🚶 Walk to the booth</button>
          <button className="btn-ghost" onClick={() => { navigator.clipboard?.writeText(`${location.origin}/app/booth/${id}`); setToast("Link copied"); }}>Share</button>
        </div>
        {isOwner ? (
          <a href={`/app/dashboard?booth=${id}`} className="btn-ghost block w-full text-center text-xs">Manage this booth · covers, links, boosts →</a>
        ) : booth.house ? (
          <p className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-400">This is the show's own booth. It is never up for takeover.</p>
        ) : (
          <button onClick={() => { track({ kind: "takeover_view", boothId: id }); onTakeover(); }} className="w-full rounded-xl border border-white/10 px-3 py-2 text-left text-xs text-slate-300 hover:border-amber-300/40">
            <b className="text-white">Take over this booth</b> for {formatMoney(price)} <span className="text-slate-500">· the owner gets {formatMoney(sellerPayout)}</span>
          </button>
        )}
        <p className="text-[11px] text-slate-500">Claimed {booth.claimedAt ? timeAgo(booth.claimedAt) : "recently"}{booth.salesCount > 1 ? ` · changed hands ${booth.salesCount - 1}×` : ""} · <Link href={`/app/booth/${id}`} className="underline">public page</Link></p>
      </div>
      {light !== null && covers[light] && (
        <Lightbox src={url(covers[light])} caption={`${booth.name} · comic ${light + 1} of ${covers.length}`} buy={buy[covers[light]] ? () => buyIt(covers[light]) : undefined} onClose={() => setLight(null)} onPrev={light > 0 ? () => setLight(light - 1) : undefined} onNext={light < covers.length - 1 ? () => setLight(light + 1) : undefined} />
      )}
    </div>
  );
}

function Lightbox({ src, caption, buy, onClose, onPrev, onNext }: { src: string; caption: string; buy?: () => void; onClose: () => void; onPrev?: () => void; onNext?: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowLeft") onPrev?.(); if (e.key === "ArrowRight") onNext?.(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);
  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/90 p-4 fade-up" onClick={onClose}>
      <img src={src} alt="" className="max-h-[80vh] max-w-full rounded-lg object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
      <div className="mt-3 flex items-center gap-3 text-sm text-slate-200" onClick={(e) => e.stopPropagation()}>
        <button onClick={onPrev} disabled={!onPrev} className="rounded-full bg-white/10 px-3 py-1 disabled:opacity-30">←</button>
        <span>{caption}</span>
        <button onClick={onNext} disabled={!onNext} className="rounded-full bg-white/10 px-3 py-1 disabled:opacity-30">→</button>
      </div>
      {buy && <button onClick={(e) => { e.stopPropagation(); buy(); }} className="btn-primary mt-3">🛒 Buy this comic ↗</button>}
      <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20">✕</button>
    </div>
  );
}
