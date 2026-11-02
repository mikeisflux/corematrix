"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- links out of the hall are full page loads on purpose: a client-side
   navigation makes React dismantle the 3D scene object by object before the next page can show */
/**
 * The storefront: what you see when you click an occupied booth on the floor.
 * Hero art, the exhibitor's links, every comic cover on their table as a
 * gallery with a lightbox, who is at the booth right now, and the actions.
 */
import { useEffect, useMemo, useState } from "react";
import { track, useHall, type HallBooth } from "@/lib/hall/store";
import { CATEGORIES, formatCount, formatMoney, BOOTH_SIZES, ZONES, takeoverSplitFor, productSlotKey } from "@/lib/config";
import { boothSpace } from "@/lib/hall/layout";
import { live } from "@/lib/hall/live";
import { openSite } from "../Booth";
import { openDm } from "../Avatar";
import { timeAgo } from "@/lib/util";
import { ShareBooth } from "@/components/ui/ShareBooth";

export interface StorefrontDetail {
  booth: { isOwner: boolean; ownerId?: string | null; description: string | null; claimedAt: number | null; salesCount: number; commissions?: string | null; commissionNote?: string | null; artstation?: string | null; deviantart?: string | null; instagram?: string | null; xUrl?: string | null; facebook?: string | null; globalcomix?: string | null; art?: Record<string, number>; artLinks?: Record<string, string> };
  totals: { views: number; clicks: number; impressions: number; uniques: number; dwellSeconds?: number; bannerClicks?: number };
  series?: Array<{ day: string; views: number; clicks: number; dwellSeconds?: number; bannerClicks?: number }>;
  week?: { rank: number; of: number; views: number } | null; // owner only: place by visits this week
  products?: Product[];
  history: Array<{ id: string; kind: string; amountCents: number; valueAfter: number; createdAt: number }>;
}
export interface Product { id: string; title: string; blurb: string | null; priceCents: number; url: string; image: number | null; clicks?: number }
export const productImage = (boothId: number, pr: Product) => (pr.image ? `/api/art/${boothId}/${productSlotKey(pr.id)}?v=${pr.image}` : null);
/** Buying stays on the exhibitor's own site: the press is counted for the booth and the item, the hall keeps running in this tab. */
export const buyProduct = (boothId: number, pr: Product) => { window.open(`/app/buy/${boothId}?p=${pr.id}`, "_blank", "noopener"); };
/** One item, full size: picture, price, the blurb, and Buy. */
function ProductOverlay({ boothId, booth, item, onClose, onPrev, onNext }: { boothId: number; booth: string; item: Product; onClose: () => void; onPrev?: () => void; onNext?: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowLeft") onPrev?.(); if (e.key === "ArrowRight") onNext?.(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);
  const img = productImage(boothId, item);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 fade-up" onClick={onClose}>
      <div className="panel flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl md:flex-row" onClick={(e) => e.stopPropagation()}>
        <div className="flex aspect-square w-full items-center justify-center bg-white/5 md:w-1/2">{img ? <img src={img} alt={item.title} className="h-full w-full object-cover" /> : <span className="text-5xl">🛍️</span>}</div>
        <div className="flex flex-1 flex-col gap-3 p-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{booth} · shop</div>
          <h3 className="text-2xl font-black leading-tight">{item.title}</h3>
          <div className="mono text-2xl font-bold text-amber-300">{item.priceCents ? formatMoney(item.priceCents) : "See price"}</div>
          {item.blurb && <p className="text-sm leading-relaxed text-slate-200">{item.blurb}</p>}
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
            <button className="btn-primary flex-1" onClick={() => buyProduct(boothId, item)}>🛒 Buy on the exhibitor's site ↗</button>
            {(onPrev || onNext) && <div className="flex gap-1"><button onClick={onPrev} disabled={!onPrev} className="rounded-full bg-white/10 px-3 py-1 disabled:opacity-30">←</button><button onClick={onNext} disabled={!onNext} className="rounded-full bg-white/10 px-3 py-1 disabled:opacity-30">→</button></div>}
          </div>
          <p className="text-[11px] text-slate-500">Opens in a new tab; the hall stays open here.</p>
        </div>
        <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20">✕</button>
      </div>
    </div>
  );
}
const secs = (n: number) => (n >= 60 ? `${Math.floor(n / 60)}m ${Math.round(n % 60)}s` : `${Math.round(n)}s`);
/** The owner's numbers, inside the hall: this week's place, two weeks of visits, how long people stay, what they click. */
function OwnerNumbers({ id, detail }: { id: number; detail: StorefrontDetail }) {
  const rows = (detail.series ?? []).slice(-14);
  const sum = rows.reduce((a, r) => ({ views: a.views + r.views, clicks: a.clicks + r.clicks, dwell: a.dwell + (r.dwellSeconds ?? 0), banner: a.banner + (r.bannerClicks ?? 0) }), { views: 0, clicks: 0, dwell: 0, banner: 0 });
  const max = Math.max(1, ...rows.map((r) => r.views));
  const w = detail.week;
  return (
    <section className="rounded-xl border border-amber-300/30 bg-amber-300/[0.06] p-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">Your numbers · 14 days</h3>
        <a href={`/app/dashboard?booth=${id}`} className="text-[11px] text-slate-400 hover:text-white">full analytics →</a>
      </div>
      {w && <p className="mt-1 text-sm"><b className="text-white">#{w.rank} of {w.of}</b> booths by visits this week <span className="text-slate-400">· {w.views} {w.views === 1 ? "visit" : "visits"} since Monday</span></p>}
      <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
        {[["Visits", String(sum.views)], ["Avg stay", sum.views ? secs(sum.dwell / sum.views) : "–"], ["Banner", String(sum.banner)], ["Link-outs", String(sum.clicks)]].map(([l, v]) => (
          <div key={l} className="rounded-lg bg-white/[0.05] px-1 py-1.5"><div className="mono text-sm font-bold">{v}</div><div className="text-[9px] uppercase tracking-wider text-slate-400">{l}</div></div>
        ))}
      </div>
      {/* visits per day: one series, so the title is the legend; each bar says its day and count on hover */}
      <div className="mt-2 flex h-10 items-end gap-[2px]" role="img" aria-label={`Visits per day over the last 14 days, ${sum.views} in all`}>
        {rows.map((r) => <div key={r.day} title={`${r.day.slice(5)} · ${r.views} ${r.views === 1 ? "visit" : "visits"}${r.dwellSeconds ? ` · ${secs(r.dwellSeconds)} total stay` : ""}`} className="flex-1 rounded-t-sm bg-amber-300" style={{ height: `${Math.max(4, (r.views / max) * 100)}%`, opacity: r.views ? 0.85 : 0.25 }} />)}
      </div>
      <div className="mt-0.5 flex justify-between text-[9px] text-slate-500 mono"><span>{rows[0]?.day.slice(5)}</span><span>today</span></div>
    </section>
  );
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
  const [item, setItem] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const products = detail?.products ?? [];
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 3000); return () => clearInterval(t); }, []); // who is at the booth refreshes
  const space = boothSpace(id);
  const art = detail?.booth.art ?? booth.art ?? {};
  const buy = detail?.booth.artLinks ?? booth.artLinks ?? {};
  const buyIt = (slot: string) => { const l = buy[slot]; if (!l) return; track({ kind: "clicks", boothId: id, source: "comic" }); window.open(l, "_blank", "noopener"); };
  const url = (slot: string) => `/api/art/${id}/${slot}?v=${art[slot] ?? 0}`;
  const covers = useMemo(() => Object.keys(art).filter((k) => k.startsWith("book:")).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5))), [art]);
  const pieces = useMemo(() => Object.keys(art).filter((k) => k.startsWith("gallery:")).sort((a, b) => Number(a.slice(8)) - Number(b.slice(8))), [art]);
  const [piece, setPiece] = useState<number | null>(null);
  const commissions = detail?.booth.commissions ?? null;
  const askCommission = () => { if (!commissions) return; track({ kind: "clicks", boothId: id, source: "commission" }); window.open(commissions, "_blank", "noopener"); };
  const signage = useMemo(() => ["wide", "portrait", "drape", "tower", "floor", "rollup:0", "rollup:1", "rollup:2", "rollup:3"].filter((k) => art[k]), [art]);
  const hero = art.wide ? url("wide") : art.portrait ? url("portrait") : art["rollup:0"] ? url("rollup:0") : null;
  const links = LINKS.map((l) => ({ ...l, href: (l.key === "website" ? booth.website : (detail?.booth[l.key] ?? booth[l.key])) ?? null })).filter((l) => l.href);
  // the booth list from sign-in answers "is this mine?" instantly; the detail fetch confirms it (and catches a booth
  // sold since), so the owner's controls don't wait on a round trip
  const listedMine = useHall((s) => s.myBooths.some((b) => b.id === id && b.role !== "staff"));
  const isOwner = !!me && (detail ? !!detail.booth.isOwner : listedMine);
  const ownerId = detail?.booth.ownerId ?? null;
  const players = Array.from(live.players.values());
  const ownerHere = ownerId ? players.find((p) => p.uid === ownerId && p.id !== live.me) : undefined;
  const iAmOwner = !!me && me.id === ownerId;
  // people standing around the booth right now (within 30 ft of its centre), me included
  const browsing = space ? players.filter((p) => Math.hypot(p.x - space.x, p.z - space.z) < 30).length : 0;
  const { price, sellerPayout } = takeoverSplitFor(booth.valueCents, booth.freeValueCents);
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
        {/* portfolio (artist tables) */}
        {pieces.length > 0 && (
          <section>
            <div className="mb-1.5 flex items-baseline justify-between"><h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Portfolio</h3><span className="text-[11px] text-slate-500">{pieces.length} {pieces.length === 1 ? "piece" : "pieces"} · tap to view</span></div>
            <div className="grid grid-cols-3 gap-1.5">
              {pieces.map((k, i) => (
                <button key={k} onClick={() => setPiece(i)} className="group relative overflow-hidden rounded-lg bg-white/5 transition hover:-translate-y-0.5">
                  <img src={url(k)} alt={`Piece ${i + 1}`} loading="lazy" className="aspect-[4/5] w-full object-cover" />
                  {buy[k] && <span className="absolute bottom-1 left-1 rounded bg-amber-300 px-1 text-[10px] font-bold text-slate-950 shadow">print</span>}
                </button>
              ))}
            </div>
            {commissions ? (
              <button onClick={askCommission} className="btn-primary mt-2 w-full">🎨 Commission me{detail?.booth.commissionNote ? <span className="ml-1 font-normal opacity-80">· {detail.booth.commissionNote}</span> : null} ↗</button>
            ) : isOwner ? <a href={`/app/dashboard?booth=${id}`} className="mt-2 block text-center text-[11px] text-slate-400 hover:text-white">Add where commissions go (Edit booth) to get a Commission me button →</a> : null}
          </section>
        )}
        {pieces.length === 0 && isOwner && space?.kind === "artist" && <a href={`/app/dashboard?booth=${id}#portfolio`} className="block rounded-xl border border-dashed border-white/15 p-3 text-center text-xs text-slate-400 hover:border-amber-300/50">Hang your portfolio on the table: upload pieces from the dashboard →</a>}
        {/* shop */}
        {products.length > 0 && (
          <section>
            <div className="mb-1.5 flex items-baseline justify-between"><h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Shop</h3><span className="text-[11px] text-slate-500">{products.length} {products.length === 1 ? "item" : "items"} · bought on the exhibitor's site</span></div>
            <div className="grid grid-cols-2 gap-2">
              {products.map((pr, i) => {
                const img = productImage(id, pr);
                return (
                  <button key={pr.id} onClick={() => setItem(i)} className="group overflow-hidden rounded-xl bg-white/[0.04] text-left transition hover:bg-white/[0.08]">
                    <div className="flex aspect-square items-center justify-center bg-white/5">{img ? <img src={img} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.03]" /> : <span className="text-3xl">🛍️</span>}</div>
                    <div className="p-2"><div className="truncate text-sm font-semibold">{pr.title}</div><div className="mono text-xs text-amber-300">{pr.priceCents ? formatMoney(pr.priceCents) : "See price"}</div></div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {products.length === 0 && isOwner && <a href={`/app/dashboard?booth=${id}#shop`} className="block rounded-xl border border-dashed border-white/15 p-3 text-center text-xs text-slate-400 hover:border-amber-300/50">Sell from your booth: list items with a price and a buy link →</a>}
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
        {isOwner && detail && <OwnerNumbers id={id} detail={detail} />}
        {/* numbers */}
        <div className="grid grid-cols-3 gap-2">
          {[["Value", formatMoney(booth.valueCents)], ["Rank", `#${rank}`], ["Visits · 7 d", formatCount(detail?.totals.views ?? 0)]].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-white/[0.04] p-2"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{l}</div><div className="mono text-base font-bold">{v}</div></div>
          ))}
        </div>
        {/* actions */}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary" onClick={() => { if (mode !== "walk") setMode("walk"); setFlyTo(id); useHall.getState().setPanel("none"); }}>🚶 Walk to the booth</button>
          <button className={sharing ? "btn-primary" : "btn-ghost"} onClick={() => setSharing((v) => !v)}>Share</button>
        </div>
        {sharing && <ShareBooth id={id} name={booth.name ?? `Booth ${space?.label ?? id}`} label={space?.label ?? String(id)} own={isOwner} compact />}
        {isOwner ? (
          <a href={`/app/dashboard?booth=${id}`} className="btn-ghost block w-full text-center text-xs">Manage this booth · covers, links, boosts →</a>
        ) : booth.house ? (
          <p className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-400">This is the show's own booth. It is never up for takeover.</p>
        ) : (
          <button onClick={() => { track({ kind: "takeover_view", boothId: id }); onTakeover(); }} className="w-full rounded-xl border border-white/10 px-3 py-2 text-left text-xs text-slate-300 hover:border-amber-300/40">
            <b className="text-white">Take over this booth</b> for {formatMoney(price)} <span className="text-slate-500">· the owner gets {formatMoney(sellerPayout)}</span>
          </button>
        )}
        <p className="text-[11px] text-slate-500">Claimed {booth.claimedAt ? timeAgo(booth.claimedAt) : "recently"}{booth.salesCount > 1 ? ` · changed hands ${booth.salesCount - 1}×` : ""} · <a href={`/app/booth/${id}`} className="underline">public page</a></p>
      </div>
      {piece !== null && pieces[piece] && (
        <Lightbox src={url(pieces[piece])} caption={`${booth.name} · piece ${piece + 1} of ${pieces.length}`} buy={buy[pieces[piece]] ? () => { track({ kind: "clicks", boothId: id, source: "print" }); window.open(buy[pieces[piece]], "_blank", "noopener"); } : undefined} buyLabel="🖼️ Buy a print ↗" commission={commissions ? askCommission : undefined} onClose={() => setPiece(null)} onPrev={piece > 0 ? () => setPiece(piece - 1) : undefined} onNext={piece < pieces.length - 1 ? () => setPiece(piece + 1) : undefined} />
      )}
      {item !== null && products[item] && (
        <ProductOverlay boothId={id} booth={booth.name ?? ""} item={products[item]} onClose={() => setItem(null)} onPrev={item > 0 ? () => setItem(item - 1) : undefined} onNext={item < products.length - 1 ? () => setItem(item + 1) : undefined} />
      )}
      {light !== null && covers[light] && (
        <Lightbox src={url(covers[light])} caption={`${booth.name} · comic ${light + 1} of ${covers.length}`} buy={buy[covers[light]] ? () => buyIt(covers[light]) : undefined} onClose={() => setLight(null)} onPrev={light > 0 ? () => setLight(light - 1) : undefined} onNext={light < covers.length - 1 ? () => setLight(light + 1) : undefined} />
      )}
    </div>
  );
}

function Lightbox({ src, caption, buy, buyLabel = "🛒 Buy this comic ↗", commission, onClose, onPrev, onNext }: { src: string; caption: string; buy?: () => void; buyLabel?: string; commission?: () => void; onClose: () => void; onPrev?: () => void; onNext?: () => void }) {
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
      {(buy || commission) && <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>{buy && <button onClick={buy} className="btn-primary">{buyLabel}</button>}{commission && <button onClick={commission} className="btn-ghost">🎨 Commission me ↗</button>}</div>}
      <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20">✕</button>
    </div>
  );
}
