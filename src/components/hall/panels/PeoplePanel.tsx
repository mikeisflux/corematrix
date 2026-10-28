"use client";
/** Who is on the floor right now, your private chats, and (for guests) the name others see. */
import { useEffect, useState } from "react";
import { api, useHall } from "@/lib/hall/store";
import { live, type LivePlayer } from "@/lib/hall/live";
import { social, useSocial, guestName, setGuestName, fireReaction, bumpSocial } from "@/lib/hall/social";
import { openDm, player } from "../Avatar";
import { timeAgo } from "@/lib/util";
import type { DmMessage } from "@/lib/dm";
import { PanelHeader } from "./common";

export function PeoplePanel() {
  const soc = useSocial();
  const me = useHall((s) => s.me);
  const mode = useHall((s) => s.mode);
  const setMode = useHall((s) => s.setMode);
  const setWalkPoint = useHall((s) => s.setWalkPoint);
  const setPanel = useHall((s) => s.setPanel);
  const [people, setPeople] = useState<LivePlayer[]>([]);
  const [name, setName] = useState(guestName());
  useEffect(() => {
    const read = () => setPeople(Array.from(live.players.values()).filter((p) => p.id !== live.me));
    read(); const t = setInterval(read, 1000); return () => clearInterval(t);
  }, []);
  useEffect(() => {
    api<{ me: string; threads: { with: string; name: string; last: DmMessage; unread: number }[] }>("/api/dm").then((d) => { social.dm.me = d.me; social.dm.threads = d.threads; social.dm.unread = d.threads.reduce((a, t) => a + t.unread, 0); bumpSocial(); }).catch(() => {});
  }, []);
  const goTo = (p: LivePlayer) => { if (mode !== "walk") setMode("walk"); setWalkPoint({ x: p.x + 3, z: p.z + 1, face: { x: p.x, z: p.z } }); setPanel("none"); };
  const dist = (p: LivePlayer) => Math.round(Math.hypot(p.x - player.x, p.z - player.z));
  const setToast = useHall((s) => s.setToast);
  const spotLink = () => `${location.origin}/app?at=${player.x.toFixed(0)},${player.z.toFixed(0)}`;
  const copySpot = async () => { try { await navigator.clipboard.writeText(spotLink()); setToast("Link copied: anyone who opens it lands right here."); } catch { setToast(spotLink()); } };
  return (
    <>
      <PanelHeader title="People" sub={`${people.length} other${people.length === 1 ? "" : "s"} walking the floor`} />
      <div className="space-y-3 p-3">
        {!me && (
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Your name on the floor</div>
            <div className="flex gap-1.5">
              <input value={name} onChange={(e) => setName(e.target.value.slice(0, 24))} placeholder="Visitor" className="input flex-1 text-sm" />
              <button onClick={() => setGuestName(name)} className="btn-primary text-xs">Save</button>
            </div>
          </div>
        )}
        {mode === "walk" && <button onClick={() => void copySpot()} className="btn-ghost w-full text-xs">📍 Copy a link to where I'm standing</button>}
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">On the floor now</div>
          {people.length === 0 && <p className="text-xs text-slate-400">Nobody else right now. Share the link; everyone lands in the same hall.</p>}
          <div className="space-y-1">
            {people.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-2.5 py-1.5 text-sm">
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-300 shadow-[0_0_6px_#5ee6c3]" />
                <span className="min-w-0 flex-1 truncate">{p.n}<span className="ml-1.5 text-[11px] text-slate-500">{mode === "walk" ? `${dist(p)} ft` : ""}</span></span>
                <button title="Wave" onClick={() => fireReaction("👋")} className="rounded-lg px-1.5 py-0.5 hover:bg-white/10">👋</button>
                <button title="Message" onClick={() => openDm(p.id, p.n)} className="rounded-lg px-1.5 py-0.5 hover:bg-white/10">💬</button>
                <button title="Go to them" onClick={() => goTo(p)} className="rounded-lg px-1.5 py-0.5 hover:bg-white/10">🚶</button>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Messages</div>
          {soc.dm.threads.length === 0 && <p className="text-xs text-slate-400">No chats yet. Click someone's 💬, or click their avatar on the floor.</p>}
          <div className="space-y-1">
            {soc.dm.threads.map((t) => (
              <button key={t.with} onClick={() => openDm(t.with, t.name)} className="flex w-full items-center gap-2 rounded-xl bg-white/[0.04] px-2.5 py-1.5 text-left text-sm hover:bg-white/[0.08]">
                <span className="min-w-0 flex-1"><span className="font-semibold">{t.name}</span><span className="ml-2 truncate text-[11px] text-slate-400">{t.last.from === soc.dm.me ? "You: " : ""}{t.last.body}</span></span>
                <span className="mono text-[10px] text-slate-500">{timeAgo(t.last.createdAt)}</span>
                {t.unread > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold">{t.unread}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
