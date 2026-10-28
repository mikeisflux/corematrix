"use client";
/** First-visit card: how to move, look and talk. Shown once per device, from the gear menu again if wanted. */
import { useEffect, useState } from "react";
import { useHall } from "@/lib/hall/store";

export function Tips() {
  const mode = useHall((s) => s.mode);
  const [show, setShow] = useState(false);
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem("fcc_tips") === "1") return; } catch {}
    setTouch("ontouchstart" in window || navigator.maxTouchPoints > 0);
    const t = setTimeout(() => setShow(true), 2500);
    return () => clearTimeout(t);
  }, []);
  if (!show || mode !== "walk") return null;
  const dismiss = () => { try { localStorage.setItem("fcc_tips", "1"); } catch {} setShow(false); };
  return (
    <div className="pointer-events-auto absolute left-1/2 top-1/2 z-30 w-[320px] max-w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 panel rounded-2xl p-4 text-sm fade-up">
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">Welcome to the floor</div>
      <ul className="mt-2 space-y-1.5 text-slate-200">
        {touch ? (
          <>
            <li>🕹️ <b>Walk</b> with the stick at the bottom left; push to the edge to run.</li>
            <li>👀 <b>Look</b> by dragging anywhere else on the screen.</li>
            <li>🪧 <b>Booths</b>: walk up and tap the card that appears.</li>
          </>
        ) : (
          <>
            <li>⌨️ <b>Walk</b> with the arrows or WASD, hold Shift to run.</li>
            <li>🖱️ <b>Look</b> by dragging the mouse. V for first person, M for the map.</li>
            <li>🪧 <b>Booths</b>: walk up and press E. Click a banner to visit the exhibitor.</li>
            <li>🙌 <b>Emotes</b> on keys 1 to 8.</li>
          </>
        )}
        <li>👥 <b>People</b> with a green triangle are real. Click them to chat; 👥 lists everyone here.</li>
        <li>🤖 <b>ConBot</b> in the arcade answers questions and leads the way.</li>
      </ul>
      <button onClick={dismiss} className="btn-primary mt-3 w-full text-xs">Got it</button>
    </div>
  );
}
