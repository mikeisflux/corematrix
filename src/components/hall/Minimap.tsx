"use client";
/** A small plan of the whole hall with you, the live people and ConBot on it; click a spot to walk there. M hides it. */
import { useEffect, useRef, useState } from "react";
import { hallLayout, HALL_LENGTH, HALL_DEPTH, X0, Z0, ARCADE } from "@/lib/hall/layout";
import { useHall } from "@/lib/hall/store";
import { live } from "@/lib/hall/live";
import { conbot } from "@/lib/hall/conbot";
import { player } from "./Avatar";

const W = 264, H = Math.round((W * HALL_DEPTH) / HALL_LENGTH) + 6;
export function Minimap() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const base = useRef<HTMLCanvasElement | null>(null);
  const booths = useHall((s) => s.booths);
  const mode = useHall((s) => s.mode);
  const setWalkPoint = useHall((s) => s.setWalkPoint);
  const setMode = useHall((s) => s.setMode);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { const t = e.target as HTMLElement; if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA") return; if (e.key === "m" || e.key === "M") setOpen((v) => !v); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);
  const sx = (x: number) => ((x - X0) / HALL_LENGTH) * W, sz = (z: number) => ((z - Z0) / HALL_DEPTH) * (H - 6) + 3;
  // the static plan (booths, arcade) is drawn once per claimed-set change
  useEffect(() => {
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d")!;
    g.fillStyle = "#0b0f1a"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#151b2e"; g.fillRect(sx(X0), sz(Z0), W, H - 6);
    for (const b of hallLayout()) {
      const own = booths.get(b.id);
      g.fillStyle = own ? own.color : "#2a3350";
      g.fillRect(sx(b.x - b.w / 2), sz(b.z - b.d / 2), Math.max(1, (b.w / HALL_LENGTH) * W), Math.max(1, (b.d / HALL_DEPTH) * (H - 6)));
    }
    g.fillStyle = "#1d1538"; g.fillRect(sx(ARCADE.x - ARCADE.w / 2), sz(ARCADE.z - ARCADE.d / 2), (ARCADE.w / HALL_LENGTH) * W, (ARCADE.d / HALL_DEPTH) * (H - 6));
    g.strokeStyle = "#ff2bd6"; g.lineWidth = 1; g.strokeRect(sx(ARCADE.x - ARCADE.w / 2), sz(ARCADE.z - ARCADE.d / 2), (ARCADE.w / HALL_LENGTH) * W, (ARCADE.d / HALL_DEPTH) * (H - 6));
    base.current = c;
  }, [booths]); // eslint-disable-line react-hooks/exhaustive-deps
  // live layer at 4 fps
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => {
      const c = canvas.current, b = base.current; if (!c || !b) return;
      const g = c.getContext("2d")!;
      g.drawImage(b, 0, 0);
      g.fillStyle = "#5ee6c3";
      for (const p of live.players.values()) if (p.id !== live.me) { g.beginPath(); g.arc(sx(p.x), sz(p.z), 2.2, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = "#ff3ddb"; g.beginPath(); g.arc(sx(conbot.x), sz(conbot.z), 2.2, 0, Math.PI * 2); g.fill();
      if (mode === "walk") {
        const x = sx(player.x), z = sz(player.z);
        g.strokeStyle = "#ffd166"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, z); g.lineTo(x + Math.sin(player.h) * 7, z + Math.cos(player.h) * 7); g.stroke();
        g.fillStyle = "#ffd166"; g.beginPath(); g.arc(x, z, 3, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "#fff"; g.lineWidth = 1; g.stroke();
      }
    }, 250);
    return () => clearInterval(t);
  }, [open, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return <button onClick={() => setOpen(true)} className="pointer-events-auto absolute bottom-14 left-3 hidden panel rounded-full px-2.5 py-1 text-[11px] md:block">🗺 map · M</button>;
  return (
    <div className="pointer-events-auto absolute bottom-14 left-3 hidden md:block">
      <canvas ref={canvas} width={W} height={H} className="cursor-crosshair rounded-lg border border-white/10 shadow-lg" title="Click to walk there · M hides the map"
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const x = X0 + ((e.clientX - r.left) / r.width) * HALL_LENGTH, z = Z0 + ((e.clientY - r.top - 3) / (r.height - 6)) * HALL_DEPTH; if (mode !== "walk") setMode("walk"); setWalkPoint({ x, z }); }} />
      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400"><span className="inline-block h-2 w-2 rounded-full bg-amber-300" />you<span className="inline-block h-2 w-2 rounded-full bg-emerald-300" />people<span className="inline-block h-2 w-2 rounded-full bg-fuchsia-400" />ConBot<span className="ml-auto mono">M</span></div>
    </div>
  );
}
