"use client";
/** Talking to ConBot: quick questions he answers (some walk you somewhere or open a panel) and emotes he performs. */
import { useHall } from "@/lib/hall/store";
import { ARCADE, standPoint } from "@/lib/hall/layout";
import { HOUSE_BOOTH_ID } from "@/lib/config";
import { conbot, botCommand, botSay, useConBot, BOT_EMOTES, JOKES, pick } from "@/lib/hall/conbot";
import { PanelHeader } from "./common";

export function ConBotPanel() {
  useConBot();
  const setPanel = useHall((s) => s.setPanel);
  const mode = useHall((s) => s.mode);
  const say = (text: string, clip?: string) => botCommand({ kind: "say", text, clip });
  const asks: { q: string; run: () => void }[] = [
    { q: "Hi ConBot!", run: () => { const n = useHall.getState().me?.displayName; say(`Hey${n ? ` ${n}` : ""}! Welcome to ForeverComicCon, the show that never closes.`, "Wave"); } },
    { q: "What is this place?", run: () => { const st = useHall.getState().stats; say(`A comic con that's open 24/7: ${st?.totalBooths ?? 1042} booths, an arcade in the middle, and real people walking the floor with you. Click any banner to visit that exhibitor.`, "Yes"); } },
    { q: "How do I get a booth?", run: () => { botSay("Pick any open space on the plan and it's yours from $5. Here's the floor plan!"); setPanel("claim"); } },
    { q: "Take me to the arcade", run: () => {
      if (mode !== "walk") { say("Switch to walking first (the 🚶 button) and I'll lead the way.", "No"); return; }
      botCommand({ kind: "lead", x: ARCADE.x, z: ARCADE.z - 26, text: "Follow me to the arcade!", arrive: "Here we are. Grab a cabinet and set a high score!" });
      setPanel("none");
    } },
    { q: "Who's the headliner?", run: () => {
      const f = useHall.getState().featured[0];
      const id = f?.id ?? HOUSE_BOOTH_ID;
      const name = f?.name ?? "the ForeverComicCon booth";
      if (mode !== "walk") { say(`${name}. Switch to walking and I'll take you there.`, "ThumbsUp"); return; }
      const sp = standPoint(id);
      botCommand({ kind: "lead", x: sp.x, z: sp.z, text: `${name}! This way, follow me.`, arrive: `Here it is: ${name}. Press E to look at the booth.` });
      setPanel("none");
    } },
    { q: "What's new?", run: () => { const ev = useHall.getState().events.slice(0, 3); say(ev.length ? `Latest on the floor: ${ev.map((e) => e.title).join(" · ")}` : "Quiet so far today. Be the first to make news: grab a booth!", "Jump"); } },
    { q: "Tell me a joke", run: () => say(pick(JOKES), pick(["Jump", "Yes", "Dance"])) },
    { q: "How do I walk around?", run: () => say("Arrows or WASD to walk, drag the mouse to look, Shift to run, E at a booth to open it, V for first person. P shows your frame rate.", "Yes") },
    { q: "Hit the lights", run: () => { const st = useHall.getState(); st.toggleNight(); say(st.night ? "House lights up! Back to show hours." : "After hours mode. Mind the neon.", st.night ? "Yes" : "Dance"); } },
    { q: "Change my look", run: () => { botSay("Outfits, hair, cosplay... go wild."); setPanel("avatar"); } },
  ];
  const live = performance.now() < conbot.lineUntil && conbot.line;
  return (
    <>
      <PanelHeader title="ConBot" sub="The con mascot · ask away" />
      <div className="space-y-3 p-3">
        <div className="flex items-start gap-2 rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-2.5 text-sm">
          <span className="text-xl">🤖</span>
          <span className="min-h-[1.5rem]">{live ? conbot.line : "…"}</span>
        </div>
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Ask ConBot</div>
          <div className="flex flex-wrap gap-1.5">
            {asks.map((a) => <button key={a.q} onClick={a.run} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs hover:border-amber-300/50 hover:bg-white/10">{a.q}</button>)}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Emotes</div>
          <div className="grid grid-cols-3 gap-1.5">
            {BOT_EMOTES.map((e) => <button key={e.clip} onClick={() => botCommand({ kind: "emote", clip: e.clip })} className="flex flex-col items-center rounded-xl border border-white/10 bg-white/5 py-2 text-xs hover:border-fuchsia-300/60 hover:bg-white/10"><span className="text-xl">{e.icon}</span>{e.label}</button>)}
          </div>
        </div>
        <button onClick={() => setPanel("none")} className="btn-ghost w-full text-xs">Bye ConBot 👋</button>
      </div>
    </>
  );
}
