"use client";
/**
 * The portfolio book, open on screen: two pieces to a spread like an open sketchbook, arrows and keys to turn, a
 * Buy a print link under a page when the artist set one, Commission me when they take commissions. Opened from the
 * book on the table, a print on the wall, or the storefront (see lib/hall/portfolio).
 */
import { useEffect, useMemo, useState } from "react";
import { api, track, useHall } from "@/lib/hall/store";
import { usePortfolio, turnPortfolio, closePortfolio } from "@/lib/hall/portfolio";

type Detail = { booth?: { commissions?: string | null; commissionNote?: string | null; artLinks?: Record<string, string> } };

export function PortfolioBook() {
  const pf = usePortfolio();
  const id = pf.boothId;
  const booth = useHall((s) => (id ? s.booths.get(id) : undefined));
  const [detail, setDetail] = useState<Detail | null>(null);
  useEffect(() => { setDetail(null); if (!id) return; let on = true; api<Detail>(`/api/booth/${id}`).then((d) => { if (on) setDetail(d); }).catch(() => null); return () => { on = false; }; }, [id]);
  const art = booth?.art ?? {};
  const pieces = useMemo(() => Object.keys(art).filter((k) => k.startsWith("gallery:")).sort((a, b) => Number(a.slice(8)) - Number(b.slice(8))), [art]);
  const spreads = Math.max(1, Math.ceil(pieces.length / 2));
  const page = Math.min(pf.page, spreads - 1);
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closePortfolio(); if (e.key === "ArrowLeft") turnPortfolio(-1, spreads - 1); if (e.key === "ArrowRight") turnPortfolio(1, spreads - 1); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [id, spreads]);
  if (!id || !booth) return null;
  const links = detail?.booth?.artLinks ?? booth.artLinks ?? {};
  const commissions = detail?.booth?.commissions ?? null;
  const url = (k: string) => `/api/art/${id}/${k}?v=${art[k] ?? 0}`;
  const buy = (k: string) => { const l = links[k]; if (!l) return; track({ kind: "clicks", boothId: id, source: "print" }); window.open(l, "_blank", "noopener"); };
  const askCommission = () => { if (!commissions) return; track({ kind: "clicks", boothId: id, source: "commission" }); window.open(commissions, "_blank", "noopener"); };
  const page$ = (k: string | undefined, side: "left" | "right") => (
    <div className={`flex min-w-0 flex-1 flex-col items-center ${side === "left" ? "items-end" : "items-start"}`}>
      <div className={`relative aspect-[11/17] h-[min(62vh,640px)] overflow-hidden bg-[#f4efe6] shadow-2xl ${side === "left" ? "rounded-l-lg" : "rounded-r-lg"}`}>
        {k ? <img src={url(k)} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-xs text-slate-500">(blank page)</div>}
        <div className={`pointer-events-none absolute inset-y-0 ${side === "left" ? "right-0 bg-gradient-to-l" : "left-0 bg-gradient-to-r"} w-10 from-black/25 to-transparent`} />
      </div>
      {k && links[k] && <button onClick={() => buy(k)} className="btn-primary mt-2 text-xs">🖼️ Buy a print ↗</button>}
    </div>
  );
  const left = pieces[page * 2], right = pieces[page * 2 + 1];
  return (
    <div data-portfolio-book className="pointer-events-auto absolute inset-0 z-[70] flex flex-col items-center justify-center bg-black/85 p-4 fade-up" onClick={closePortfolio}>
      <div className="mb-3 text-center text-sm text-slate-200" onClick={(e) => e.stopPropagation()}><span className="mr-2 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">Portfolio</span><b>{booth.name ?? `Booth ${booth.label}`}</b><span className="ml-2 text-slate-400">{pieces.length} piece{pieces.length === 1 ? "" : "s"}</span></div>
      <div className="flex w-full max-w-5xl items-stretch justify-center gap-1" onClick={(e) => e.stopPropagation()}>
        {page$(left, "left")}
        <div className="w-1 self-stretch rounded bg-black/60" />
        {page$(right, "right")}
      </div>
      <div className="mt-3 flex items-center gap-3 text-sm text-slate-200" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => turnPortfolio(-1, spreads - 1)} disabled={page === 0} className="rounded-full bg-white/10 px-3 py-1 disabled:opacity-30">← Previous</button>
        <span className="text-slate-400">Spread {page + 1} of {spreads} · ← → keys</span>
        <button onClick={() => turnPortfolio(1, spreads - 1)} disabled={page >= spreads - 1} className="rounded-full bg-white/10 px-3 py-1 disabled:opacity-30">Next →</button>
      </div>
      {commissions && <button onClick={(e) => { e.stopPropagation(); askCommission(); }} className="btn-ghost mt-3 text-xs">🎨 Commission me{detail?.booth?.commissionNote ? <span className="ml-1 opacity-80">· {detail.booth.commissionNote}</span> : null} ↗</button>}
      <button onClick={closePortfolio} className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20">✕ Close</button>
    </div>
  );
}
