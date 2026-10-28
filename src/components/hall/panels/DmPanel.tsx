"use client";
/** A private chat with one person: only the two of you receive these. */
import { useEffect, useRef, useState } from "react";
import { api, useHall } from "@/lib/hall/store";
import { live } from "@/lib/hall/live";
import { social, useSocial, guestName, bumpSocial } from "@/lib/hall/social";
import { timeAgo } from "@/lib/util";
import type { DmMessage } from "@/lib/dm";
import { PanelHeader } from "./common";
import { player } from "../Avatar";

export function DmPanel() {
  const soc = useSocial();
  const setPanel = useHall((s) => s.setPanel);
  const setWalkPoint = useHall((s) => s.setWalkPoint);
  const setMode = useHall((s) => s.setMode);
  const active = soc.dm.active;
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const me = useHall((s) => s.me);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    api<{ me: string; messages: DmMessage[] }>(`/api/dm?with=${encodeURIComponent(active.id)}`).then((d) => { social.dm.me = d.me; social.dm.messages = d.messages; const th = social.dm.threads.find((t) => t.with === active.id); if (th) th.unread = 0; social.dm.unread = social.dm.threads.reduce((a, t) => a + t.unread, 0); bumpSocial(); }).catch(() => {});
  }, [active]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [soc.dm.messages.length]);
  if (!active) return <><PanelHeader title="Messages" onBack={() => setPanel("people")} /><p className="p-3 text-xs text-slate-400">Pick someone in People.</p></>;
  const onFloor = live.players.get(active.id);
  const post = async (body: string) => {
    setErr(null);
    try { await api("/api/dm", { method: "POST", body: JSON.stringify({ to: active.id, body, name: guestName() || undefined }) }); setText(""); }
    catch (er) { setErr((er as Error).message); }
  };
  const send = async (e: React.FormEvent) => { e.preventDefault(); const body = text.trim(); if (body) await post(body); };
  const mode = useHall.getState().mode;
  const sendSpot = () => post(`Meet me here: ${location.origin}/app?at=${player.x.toFixed(0)},${player.z.toFixed(0)}`);
  // links in messages (meet-me spots) are clickable
  // a meet-me link (any host, as long as it carries ?at=x,z) teleports in place; anything else opens in a new tab, never this one
  const follow = (part: string) => {
    let at: number[] | undefined;
    try { at = new URL(part).searchParams.get("at")?.split(",").map(Number); } catch { at = undefined; }
    if (at && at.length === 2 && at.every((n) => Number.isFinite(n))) { setMode("walk"); setWalkPoint({ x: at[0], z: at[1] }); setPanel("none"); return; }
    try { window.open(part, "_blank", "noopener"); } catch { /* popup blocked: nothing else to do */ }
  };
  const rich = (t: string) => t.split(/(https?:\/\/\S+)/g).map((part, i) => /^https?:\/\//.test(part) ? <a key={i} href={part} className="underline" onClick={(ev) => { ev.preventDefault(); follow(part); }}>{part.includes("?at=") ? "📍 meet-up spot" : part}</a> : part);
  return (
    <>
      <PanelHeader title={active.name} sub={onFloor ? "On the floor now · private chat" : "Not on the floor right now · they get it when they're back"} onBack={() => setPanel("people")} />
      {onFloor?.uid && me && onFloor.uid !== me.id && (
        <button onClick={() => void api<{ status: string }>("/api/friends", { method: "POST", body: JSON.stringify({ to: onFloor.uid }) }).then((r) => useHall.getState().setToast(r.status === "accepted" ? `🤝 You and ${active.name} are friends now` : `🤝 Friend request sent to ${active.name}`)).catch((e: Error) => useHall.getState().setToast(e.message))} className="mx-3 mt-2 btn-ghost w-[calc(100%-1.5rem)] text-xs">➕ Add {active.name} as a friend</button>
      )}
      <div className="max-h-[45vh] space-y-1.5 overflow-y-auto scroll p-3">
        {soc.dm.messages.length === 0 && <p className="text-xs text-slate-400">Say hi. Only {active.name} sees this.</p>}
        {soc.dm.messages.map((m) => {
          const mine = m.from === soc.dm.me;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${mine ? "bg-amber-300 text-slate-900" : "bg-white/[0.08] text-slate-100"}`}>
                <div className="break-words">{rich(m.body)}</div>
                <div className={`mt-0.5 text-[10px] ${mine ? "text-slate-700" : "text-slate-500"} mono`}>{timeAgo(m.createdAt)}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {mode === "walk" && <div className="px-2 pt-2"><button type="button" onClick={() => void sendSpot()} className="btn-ghost w-full text-xs">📍 Send where I am</button></div>}
      <form onSubmit={send} className="flex gap-1.5 border-t border-white/8 p-2">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={`Message ${active.name}`} className="input flex-1 text-sm" autoFocus />
        <button className="btn-primary text-xs" disabled={!text.trim()}>Send</button>
      </form>
      {err && <p className="px-3 pb-2 text-[11px] text-rose-300">{err}</p>}
      {onFloor && <div className="px-3 pb-3"><button onClick={() => { setMode("walk"); setWalkPoint({ x: onFloor.x + 3, z: onFloor.z + 1, face: { x: onFloor.x, z: onFloor.z } }); setPanel("none"); }} className="btn-ghost w-full text-xs">🚶 Go stand next to them</button></div>}
    </>
  );
}
