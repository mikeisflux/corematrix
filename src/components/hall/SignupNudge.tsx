"use client";
/**
 * After two minutes of walking as a guest, one card: make an account so your
 * avatar, name, settings, coins and friends stick. Shown once per device.
 */
import { useEffect, useRef, useState } from "react";
import { useHall } from "@/lib/hall/store";

const KEY = "fcc_signup_nudge";
const AFTER_MS = 2 * 60 * 1000;

export function SignupNudge() {
  const me = useHall((s) => s.me);
  const mode = useHall((s) => s.mode);
  const panel = useHall((s) => s.panel);
  const setPanel = useHall((s) => s.setPanel);
  const [show, setShow] = useState(false);
  const walked = useRef(0);   // ms spent in walk mode
  const last = useRef(0);
  useEffect(() => {
    if (me) { setShow(false); return; }
    try { if (localStorage.getItem(KEY) === "1") return; } catch {}
    // count only time actually walking the floor, with the tab in front
    last.current = performance.now();
    const t = setInterval(() => {
      const now = performance.now();
      if (useHall.getState().mode === "walk" && !document.hidden) walked.current += now - last.current;
      last.current = now;
      if (walked.current >= AFTER_MS) { clearInterval(t); setShow(true); }
    }, 1000);
    return () => clearInterval(t);
  }, [me]);
  if (!show || me || mode !== "walk" || panel !== "none") return null;
  const dismiss = () => { try { localStorage.setItem(KEY, "1"); } catch {} setShow(false); };
  return (
    <div className="pointer-events-auto absolute left-1/2 top-1/2 z-30 w-[340px] max-w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 panel rounded-2xl p-4 text-sm fade-up">
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">Enjoying the floor?</div>
      <div className="mt-1 text-base font-bold">Save your settings with a free account</div>
      <p className="mt-1.5 text-slate-300">Right now your avatar, name and settings live only in this browser. An account keeps them everywhere, plus your coins, your streak, your friends and your chats. It takes ten seconds.</p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => { dismiss(); setPanel("me"); }} className="btn-primary flex-1">Create account</button>
        <button onClick={dismiss} className="btn-ghost">Not now</button>
      </div>
    </div>
  );
}
