"use client";
/** Emotes the walker can play (everyone nearby sees them) and quick reactions that pop over the head. */
import { useHall } from "@/lib/hall/store";
import { EMOTES } from "@/lib/hall/modelkit/avatar";
import { fireEmote, fireReaction, REACTIONS } from "@/lib/hall/social";
import { PanelHeader } from "./common";

export function EmotesPanel() {
  const mode = useHall((s) => s.mode);
  const setMode = useHall((s) => s.setMode);
  return (
    <>
      <PanelHeader title="Emotes" sub="Everyone on the floor sees them" />
      <div className="space-y-3 p-3">
        {mode !== "walk" && <button onClick={() => setMode("walk")} className="btn-primary w-full text-xs">Walk the floor to use emotes</button>}
        <div className="grid grid-cols-4 gap-1.5">
          {EMOTES.map((e, i) => (
            <button key={e.id} onClick={() => fireEmote(e.id)} disabled={mode !== "walk"} className="flex flex-col items-center rounded-xl border border-white/10 bg-white/5 py-2 text-[11px] hover:border-amber-300/60 hover:bg-white/10 disabled:opacity-40">
              <span className="text-2xl">{e.icon}</span>{e.label}<span className="mono text-[9px] text-slate-500">{i + 1}</span>
            </button>
          ))}
        </div>
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Reactions</div>
          <div className="flex flex-wrap gap-1.5">
            {REACTIONS.map((r) => <button key={r} onClick={() => fireReaction(r)} disabled={mode !== "walk"} className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xl hover:border-amber-300/60 hover:bg-white/10 disabled:opacity-40">{r}</button>)}
          </div>
        </div>
        <p className="text-[11px] text-slate-500">Keys 1–8 play emotes while you walk. Moving cancels one. Click a person with a green triangle to message them.</p>
      </div>
    </>
  );
}
