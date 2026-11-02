"use client";
/**
 * Share a booth: the flyer-style card (/api/og/<id>) with one-tap posts to X, Bluesky, Facebook and Reddit, a copied
 * link for Discord and messages, the phone's share sheet with the card attached, and the card as a download.
 * Every link carries ?src=<network>, so the dashboard's referrers show where the visits came from.
 */
import { useState } from "react";
import { SITE_NAME } from "@/lib/config";

export function ShareBooth({ id, name, label, own, origin, compact }: { id: number; name: string; label: string; own?: boolean; origin?: string; compact?: boolean }) {
  const base = origin ?? (typeof location !== "undefined" ? location.origin : "");
  const url = (src: string) => `${base}/app/booth/${id}?src=${src}`;
  const text = own ? `I'm exhibiting at ${SITE_NAME}, the virtual comic con that never closes. Come by booth ${label}:` : `${name} is at ${SITE_NAME}, booth ${label}. Walk up and say hi:`;
  const card = `${base}/api/og/${id}`;
  const [note, setNote] = useState<string | null>(null);
  const say = (s: string) => { setNote(s); setTimeout(() => setNote(null), 2500); };
  const copy = async (s: string, what: string) => { try { await navigator.clipboard.writeText(s); say(`${what} copied`); } catch { say("Copy didn't work here; select the text instead"); } };
  const sheet = async () => {
    if (!navigator.share) { void copy(`${text} ${url("share")}`, "Link"); return; }
    try {
      const r = await fetch(card); const blob = await r.blob();
      const file = new File([blob], `booth-${label}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ title: `${name} at ${SITE_NAME}`, text, url: url("share"), files: [file] });
      else await navigator.share({ title: `${name} at ${SITE_NAME}`, text, url: url("share") });
    } catch { /* the sheet was closed */ }
  };
  const open = (href: string) => window.open(href, "_blank", "noopener,width=640,height=560");
  const nets: Array<[string, string, string]> = [
    ["X", "𝕏", `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url("x"))}`],
    ["Bluesky", "🦋", `https://bsky.app/intent/compose?text=${encodeURIComponent(`${text} ${url("bluesky")}`)}`],
    ["Facebook", "f", `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url("facebook"))}`],
    ["Reddit", "r/", `https://www.reddit.com/submit?url=${encodeURIComponent(url("reddit"))}&title=${encodeURIComponent(`${name} at ${SITE_NAME}, booth ${label}`)}`],
  ];
  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <img src={card} alt={`${name} share card`} className="w-full rounded-xl border border-white/10" />
      <div className="flex flex-wrap gap-1.5">
        {nets.map(([n, g, href]) => <button key={n} onClick={() => open(href)} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"><span className="text-[11px] font-black">{g}</span>{n}</button>)}
        <button onClick={() => copy(url("share"), "Link")} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20">🔗 Copy link <span className="font-normal text-slate-400">· Discord, messages</span></button>
        <button onClick={sheet} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20">📲 Share…</button>
        <a href={card} download={`booth-${label}.png`} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20">⬇️ Card</a>
      </div>
      {!compact && (
        <div className="flex gap-2">
          <textarea readOnly rows={2} className="input flex-1 text-xs" value={`${text} ${url("share")}`} onFocus={(e) => e.target.select()} />
          <button onClick={() => copy(`${text} ${url("share")}`, "Caption")} className="btn-ghost text-xs">Copy caption</button>
        </div>
      )}
      {note && <p className="text-[11px] text-emerald-300">{note}</p>}
    </div>
  );
}
