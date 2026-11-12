"use client";
/**
 * 18+ pieces. An exhibitor may mark a portfolio piece, a comic cover or a shop photo as adult content; the server then
 * sends everyone a blurred stand-in (see /api/art/[id]/[slot]) and the picture itself only to a viewer who has confirmed
 * here that they are 18 or older. The answer is kept in a cookie (the server reads it) for a year on this device.
 */
import { useEffect, useState, useSyncExternalStore, type ImgHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";

const listeners = new Set<() => void>();
const read = () => typeof document !== "undefined" && /(?:^|;\s*)fcc_18=1(?:;|$)/.test(document.cookie);
/** True once this visitor has confirmed they are 18 or older. */
export function useAdultOk() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, read, () => false);
}
export function confirmAdult() {
  document.cookie = "fcc_18=1; Path=/; Max-Age=31536000; SameSite=Lax";
  listeners.forEach((l) => l());
}
/** The address of a piece: the picture itself for a confirmed adult, the blurred stand-in otherwise. */
export const adultSrc = (src: string, adult: boolean | undefined, ok: boolean) => (adult && ok ? `${src}${src.includes("?") ? "&" : "?"}a=1` : src);

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4" onClick={(e) => { e.stopPropagation(); onClose(); }} role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900 p-5 text-left text-slate-100 shadow-2xl" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

/** The question itself. `onYes` runs after the answer is saved. */
export function AgeGate({ onYes, onNo }: { onYes?: () => void; onNo: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <Shell onClose={onNo}>
      <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-rose-500/20 px-3 py-1 text-xs font-bold text-rose-200">18+ · Adult content</div>
      <h2 className="text-lg font-bold">Are you 18 or older?</h2>
      <p className="mt-2 text-sm text-slate-300">The exhibitor marked this piece as adult content. You need to be 18 or older to see it.</p>
      <div className="mt-4 flex flex-col gap-2">
        <button autoFocus onClick={() => { confirmAdult(); onYes?.(); }} className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-amber-300">Yes, I am 18 or older</button>
        <button onClick={onNo} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15">No, take me back</button>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Your answer is remembered on this device.</p>
    </Shell>,
    document.body,
  );
}

/**
 * An image that may be 18+. Until the viewer confirms their age it shows the blurred stand-in; clicking it asks.
 * `ask` opens the question straight away (a lightbox that was opened on purpose); `onDecline` runs on "no".
 */
export function AdultImg({ adult, src, ask = false, onDecline, onClick, ...rest }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src: string; adult?: boolean; ask?: boolean; onDecline?: () => void }) {
  const ok = useAdultOk();
  const [open, setOpen] = useState(ask);
  const [was, setWas] = useState(src);
  if (was !== src) { setWas(src); setOpen(ask); } // the next piece in a lightbox asks again (until the answer is yes)
  // eslint-disable-next-line @next/next/no-img-element
  if (!adult || ok) return <img {...rest} src={adultSrc(src, adult, ok)} onClick={onClick} />;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img {...rest} src={src} title="Adult content (18+). Click to view." style={{ ...rest.style, cursor: "pointer" }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }} />
      {open && <AgeGate onYes={() => setOpen(false)} onNo={() => { setOpen(false); onDecline?.(); }} />}
    </>
  );
}

/** Dashboard: an upload was refused for nudity but may be kept as 18+. Resolves true when the owner ticks the box and confirms. */
export function askAdultUpload(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v: boolean) => { root.unmount(); host.remove(); resolve(v); };
    function Ask() {
      const [sure, setSure] = useState(false);
      return (
        <Shell onClose={() => done(false)}>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-rose-500/20 px-3 py-1 text-xs font-bold text-rose-200">Upload refused</div>
          <h2 className="text-lg font-bold">This image looks like adult content</h2>
          <p className="mt-2 text-sm text-slate-300">{message}</p>
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl bg-white/5 p-3 text-sm">
            <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-400" />
            <span><b>This is adult content (18+).</b> Upload it uncensored. Visitors see it blurred with an 18+ mark, and only see the picture after they confirm they are 18 or older.</span>
          </label>
          <div className="mt-4 flex gap-2">
            <button disabled={!sure} onClick={() => done(true)} className="flex-1 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-amber-300 disabled:opacity-40">Upload as 18+</button>
            <button onClick={() => done(false)} className="flex-1 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15">Cancel</button>
          </div>
        </Shell>
      );
    }
    root.render(<Ask />);
  });
}
