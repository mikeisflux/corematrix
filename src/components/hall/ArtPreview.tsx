"use client";
/** The full-size cover or print a visitor is holding the mouse on (see lib/hall/preview.ts). Not interactive: the pointer stays on the table. */
import { usePreview } from "@/lib/hall/preview";

export function ArtPreview() {
  const pv = usePreview();
  if (!pv.url) return null;
  return (
    <div data-art-preview className="pointer-events-none absolute inset-0 z-[60] flex flex-col items-center justify-center bg-black/60 fade-up">
      <img src={pv.url} alt={pv.caption} className="max-h-[78vh] max-w-[min(90vw,900px)] rounded-xl object-contain shadow-2xl" />
      <div className="mt-3 rounded-full bg-black/70 px-4 py-1.5 text-sm text-slate-100">{pv.caption} <span className="text-slate-400">· move the mouse away to close</span></div>
    </div>
  );
}
