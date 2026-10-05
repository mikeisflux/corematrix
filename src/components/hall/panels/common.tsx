"use client";
import { useHall } from "@/lib/hall/store";

export function PanelHeader({ title, sub, onBack }: { title: string; sub?: string; onBack?: () => void }) {
  const setPanel = useHall((s) => s.setPanel);
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-white/8 bg-[var(--panel)] px-3 py-2.5">
      {onBack && <button onClick={onBack} className="rounded-lg px-2 py-1 text-slate-300 hover:bg-white/10">←</button>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-bold uppercase tracking-[0.18em]">{title}</div>
        {sub && <div className="truncate text-[11px] text-slate-400">{sub}</div>}
      </div>
      <button onClick={() => setPanel("none")} className="rounded-lg px-2 py-1 text-slate-300 hover:bg-white/10" aria-label="Close">✕</button>
    </div>
  );
}

export { SignIn } from "@/components/ui/AuthForms";

export function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="kpi">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mono text-lg font-bold ${accent ? "text-amber-300" : ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}
