"use client";
import { useEffect, useRef, useState } from "react";

/** Reveal-on-scroll: adds .on to every .mk-reveal as it enters the viewport. */
export function Reveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".mk-reveal"));
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("on"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -10% 0px", threshold: 0.1 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}

/** Glow blobs that drift with the pointer, very slowly. */
export function PointerGlow() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const move = (e: PointerEvent) => { tx = (e.clientX / window.innerWidth - 0.5) * 80; ty = (e.clientY / window.innerHeight - 0.5) * 60; };
    const tick = () => { x += (tx - x) * 0.04; y += (ty - y) * 0.04; el.style.transform = `translate(${x}px, ${y}px)`; raf = requestAnimationFrame(tick); };
    window.addEventListener("pointermove", move); raf = requestAnimationFrame(tick);
    return () => { window.removeEventListener("pointermove", move); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 z-0" aria-hidden>
      <div className="mk-glow mk-glow--pink" style={{ width: 620, height: 620, left: "-10%", top: "-12%" }} />
      <div className="mk-glow mk-glow--cyan" style={{ width: 520, height: 520, right: "-8%", top: "6%", opacity: 0.35 }} />
      <div className="mk-glow mk-glow--violet" style={{ width: 760, height: 760, left: "30%", top: "28%", opacity: 0.4 }} />
    </div>
  );
}

/** Counts up to a value once visible. */
export function CountUp({ to, prefix = "", suffix = "", decimals = 0 }: { to: number; prefix?: string; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return; io.disconnect();
      const t0 = performance.now(), dur = 1600;
      const step = (t: number) => { const p = Math.min(1, (t - t0) / dur); const ease = 1 - Math.pow(1 - p, 3); setV(to * ease); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }, { threshold: 0.4 });
    io.observe(el); return () => io.disconnect();
  }, [to]);
  return <span ref={ref}>{prefix}{v.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}{suffix}</span>;
}

/** Tilts a card toward the pointer. */
export function Tilt({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className={`mk-tilt ${className}`}
      onPointerMove={(e) => { const el = ref.current; if (!el) return; const r = el.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5; el.style.transform = `perspective(1200px) rotateX(${-py * 6}deg) rotateY(${px * 8}deg) translateY(-4px)`; }}
      onPointerLeave={() => { if (ref.current) ref.current.style.transform = ""; }}>
      {children}
    </div>
  );
}
