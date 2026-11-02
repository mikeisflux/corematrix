"use client";
/**
 * Walk-mode voice controls: the push-to-talk button (hold it, or hold T) and the people close enough to hear, with a
 * speaker on whoever is talking. Two placements: on a desktop a compact pill at the bottom right beside the mode rail
 * (the bottom left has the minimap and the page links, the centre the prompts and the help line); on a phone a
 * thumb-sized button beside the mode rail at the bottom left, under the left thumb and clear of the joystick on the
 * right, with the list stacked above it.
 */
import { useVoice, setTalking, type VoicePeer } from "@/lib/hall/voice";

function PeerRow({ id, p }: { id: string; p: VoicePeer }) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap" data-voice-peer={id} data-state={p.state} data-talking={p.speaking ? "1" : "0"}>
      <span className={p.speaking ? "text-emerald-300" : "text-slate-500"} title={p.state === "connected" ? (p.speaking ? "talking" : "connected") : p.state}>{p.speaking ? "🔊" : p.state === "connected" ? "🎧" : "⋯"}</span>
      <span className={`max-w-[110px] truncate ${p.speaking ? "font-semibold text-white" : "text-slate-200"}`}>{p.name}</span>
    </span>
  );
}

export function VoiceHud() {
  const v = useVoice();
  if (!v.enabled) return null;
  const peers = Array.from(v.peers.entries()).sort((a, b) => a[1].dist - b[1].dist);
  const stop = () => setTalking(false);
  const lit = v.talking ? "bg-emerald-400/30 ring-2 ring-emerald-300 shadow-[0_0_18px_#34d399]" : "bg-white/5 hover:bg-white/10";
  const button = (size: string) => (
    <button
      data-ptt
      title="Hold to talk (T)"
      aria-pressed={v.talking}
      onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setTalking(true); }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
      style={{ touchAction: "none" }}
      className={`pointer-events-auto flex select-none items-center justify-center rounded-full transition ${size} ${lit}`}
    >
      <span aria-hidden>{v.talking ? "🎙️" : "🎤"}</span>
      <span className="sr-only">{v.talking ? "Talking" : "Hold to talk"}</span>
    </button>
  );
  return (
    <>
      <div className="pointer-events-auto panel absolute bottom-3 right-16 hidden items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs fade-up md:flex" data-voice-hud="desktop">
        {button("h-8 w-8 text-base")}
        {peers.length > 0
          ? <span className="flex items-center gap-2" data-voice-peers>{peers.map(([id, p]) => <PeerRow key={id} id={id} p={p} />)}</span>
          : <span className="mono text-[10px] text-slate-400">{v.talking ? "talking…" : "hold T to talk"}</span>}
      </div>
      <div className="pointer-events-none absolute bottom-6 left-[4.75rem] flex flex-col items-start gap-1.5 fade-up md:hidden" data-voice-hud="phone">
        {peers.length > 0 && (
          <div className="panel flex flex-col gap-0.5 rounded-xl px-2.5 py-1.5 text-[11px]" data-voice-peers>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Voice nearby</div>
            {peers.map(([id, p]) => <PeerRow key={id} id={id} p={p} />)}
          </div>
        )}
        {button("panel h-14 w-14 text-2xl")}
      </div>
    </>
  );
}
