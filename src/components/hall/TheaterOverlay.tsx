"use client";
/**
 * The theater, full screen: the same <video> the arcade screen plays (so it is the same frame as everyone else sees),
 * with sound, a real full-screen button, and the programme: what is on now, what is next, and the next showings with
 * their UTC and local times so people can agree to meet and watch together. Deep link: /app?theater=1.
 */
import { useEffect, useRef, useState } from "react";
import { api, useHall } from "@/lib/hall/store";
import { theater, useTheater, setTheaterOpen, setTheaterSound } from "@/lib/hall/theater";
import { showtimes } from "@/lib/theater-schedule";

type Playlist = { title: string; serverTime: number; items: { id: string; title: string; category?: string; duration: number }[] };
const CAT: Record<string, string> = { movie: "🎞️ Movie", cartoon: "📺 Cartoon", stream: "🔴 Live stream", other: "🎬 Showcase" };
const pad = (n: number) => String(n).padStart(2, "0");
const utc = (s: number) => { const d = new Date(s * 1000); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`; };
const local = (s: number) => new Date(s * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const dayTag = (s: number, nowS: number) => { const d = new Date(s * 1000), n = new Date(nowS * 1000); return d.getUTCDate() === n.getUTCDate() ? "" : " (tomorrow)"; };
const mins = (s: number) => (s < 60 ? "under a minute" : `${Math.round(s / 60)} min`);

export function TheaterOverlay() {
  const th = useTheater();
  const setToast = useHall((s) => s.setToast);
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState<Playlist | null>(null);
  const [skew, setSkew] = useState(0); // server clock minus ours, so the programme uses the shared clock
  const [tick, setTick] = useState(0);
  const [full, setFull] = useState(false);
  // the programme, refreshed every two minutes; the list re-renders every 15 s so "in 3 min" stays honest
  useEffect(() => {
    let alive = true;
    const load = () => api<Playlist>("/api/theater").then((d) => { if (!alive) return; setShow(d); setSkew(d.serverTime - Date.now()); }).catch(() => {});
    load(); const t = setInterval(load, 120000); const k = setInterval(() => setTick((n) => n + 1), 15000);
    return () => { alive = false; clearInterval(t); clearInterval(k); };
  }, []);
  // the screen's own <video> moves into this box while the overlay is open and goes back to living offscreen after
  useEffect(() => {
    const v = th.video, host = box.current;
    if (!v || !host) return;
    v.style.cssText = "width:100%;height:100%;object-fit:contain;background:#000;display:block";
    host.appendChild(v);
    void v.play().catch(() => {});
    return () => { if (v.parentNode === host) host.removeChild(v); v.removeAttribute("style"); };
  }, [th.video]);
  useEffect(() => {
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs); return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.fullscreenElement) setTheaterOpen(false); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);
  const close = () => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); setTheaterOpen(false); };
  const goFull = () => { const el = frame.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); else void el.requestFullscreen?.().catch(() => setToast("Your browser would not go full screen here. Try the browser's own full-screen key (F11).")); };
  void tick;
  const nowS = (Date.now() + skew) / 1000;
  const items = show?.items ?? [];
  const times = items.length ? showtimes(items, nowS, 9) : [];
  const current = times[0];
  const invite = () => {
    const next = times[1];
    const line = next ? `${items[next.index].title} starts at ${utc(next.startS)} on the ForeverComicCon theater. Watch it with me: ${location.origin}/app?theater=1` : `Come watch the theater with me: ${location.origin}/app?theater=1`;
    navigator.clipboard?.writeText(line).then(() => setToast("Invite copied. Paste it anywhere; the link opens the theater full screen.")).catch(() => setToast(line));
  };
  return (
    <div data-theater-overlay className="pointer-events-auto absolute inset-0 z-50 flex flex-col bg-black/90 text-slate-100 fade-up md:flex-row">
      <div ref={frame} className="relative flex min-h-0 flex-1 flex-col bg-black">
        <div ref={box} className="min-h-0 flex-1" />
        {!th.playing && <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-slate-400">{items.length ? "Tuning in to the shared stream…" : "Nothing is scheduled on the screen right now."}</div>}
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-slate-950/90 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate"><span className="mr-2 rounded bg-rose-500/20 px-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-200">● Live · in sync with everyone</span><b>{current ? items[current.index].title : th.title || "Now showing"}</b>{current && <span className="ml-2 text-xs text-slate-400">{CAT[items[current.index].category ?? "movie"] ?? CAT.other} · ends {utc(current.endS)}</span>}</span>
          <button className="btn-ghost text-xs" onClick={() => setTheaterSound(!th.sound)}>{th.sound ? "🔊 Sound on" : "🔇 Sound off"}</button>
          <button data-fullscreen className="btn-ghost text-xs" onClick={goFull}>{full ? "⛶ Exit full screen" : "⛶ Full screen"}</button>
          <button className="btn-ghost text-xs" onClick={invite}>🔗 Invite someone</button>
          <button className="btn-primary text-xs" onClick={close}>✕ Back to the hall</button>
        </div>
      </div>
      <aside className="max-h-[40vh] w-full shrink-0 overflow-y-auto border-t border-white/10 bg-slate-950 p-3 md:max-h-none md:w-80 md:border-l md:border-t-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Showtimes</div>
        <p className="mt-1 text-[11px] text-slate-400">The programme loops around the clock. Times are UTC first, then your clock. Everyone sees the same frame at the same moment, so pick a time and meet here.</p>
        {times.length === 0 && <p className="mt-3 text-sm text-slate-400">Nothing scheduled yet.</p>}
        <ol className="mt-3 space-y-1.5">
          {times.map((t, i) => { const it = items[t.index]; return (
            <li key={`${t.index}-${t.startS}`} className={`rounded-xl px-2.5 py-2 ${t.now ? "bg-amber-300/15 ring-1 ring-amber-300/40" : "bg-white/[0.04]"}`}>
              <div className="flex items-baseline justify-between gap-2"><b className="min-w-0 truncate text-sm">{it.title}</b><span className="shrink-0 text-[11px] text-slate-400">{CAT[it.category ?? "movie"] ?? CAT.other}</span></div>
              <div className="mt-0.5 flex items-baseline justify-between text-[11px]">
                <span className="mono text-amber-200">{utc(t.startS)}{dayTag(t.startS, nowS)}<span className="text-slate-500"> · {local(t.startS)} your time</span></span>
                <span className="text-slate-400">{t.now ? `on now · ${mins(t.endS - nowS)} left` : i === 1 ? `next · in ${mins(t.startS - nowS)}` : mins(t.endS - t.startS)}</span>
              </div>
            </li>); })}
        </ol>
      </aside>
    </div>
  );
}
