"use client";
/** Who is on the floor right now, your private chats, and (for guests) the name others see. */
import { useEffect, useState } from "react";
import { api, useHall } from "@/lib/hall/store";
import { live, type LivePlayer } from "@/lib/hall/live";
import { social, useSocial, fireReaction, bumpSocial } from "@/lib/hall/social";
import { openDm, player } from "../Avatar";
import { timeAgo } from "@/lib/util";
import type { DmMessage } from "@/lib/dm";
import { PanelHeader } from "./common";

interface Person { id: string; name: string; handle: string | null }

export function PeoplePanel() {
  const soc = useSocial();
  const me = useHall((s) => s.me);
  const mode = useHall((s) => s.mode);
  const setMode = useHall((s) => s.setMode);
  const setWalkPoint = useHall((s) => s.setWalkPoint);
  const setPanel = useHall((s) => s.setPanel);
  const [people, setPeople] = useState<LivePlayer[]>([]);
  // friends: who I'm friends with, who asked me, who I asked; refetched when a request arrives or is answered
  const [fr, setFr] = useState<{ friends: Person[]; incoming: Array<Person & { requestId: string }>; outgoing: Array<Person & { requestId: string }> } | null>(null);
  const setToast = useHall((s) => s.setToast);
  const loadFriends = () => { if (me) api<NonNullable<typeof fr>>("/api/friends").then(setFr).catch(() => {}); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadFriends, [me, soc.friendsVersion]);
  const relation = (uid: string | null | undefined): "me" | "friend" | "asked" | "pending" | "none" | null => {
    if (!uid || !me) return null;
    if (uid === me.id) return "me";
    if (!fr) return "none";
    if (fr.friends.some((f) => f.id === uid)) return "friend";
    if (fr.incoming.some((f) => f.id === uid)) return "pending";
    if (fr.outgoing.some((f) => f.id === uid)) return "asked";
    return "none";
  };
  const addFriend = async (uid: string, who: string) => {
    try { const r = await api<{ status: string }>("/api/friends", { method: "POST", body: JSON.stringify({ to: uid }) }); setToast(r.status === "accepted" ? `🤝 You and ${who} are friends now` : `🤝 Friend request sent to ${who}`); loadFriends(); }
    catch (e) { setToast((e as Error).message); }
  };
  const answer = async (id: string, accept: boolean) => { try { await api("/api/friends", { method: "PATCH", body: JSON.stringify({ id, accept }) }); loadFriends(); } catch (e) { setToast((e as Error).message); } };
  const unfriend = async (p: Person) => { if (!confirm(`Remove ${p.name} from your friends?`)) return; await api(`/api/friends?id=${p.id}`, { method: "DELETE" }); loadFriends(); };
  const onFloor = (uid: string) => Array.from(live.players.values()).find((p) => p.uid === uid && p.id !== live.me);
  useEffect(() => {
    const read = () => setPeople(Array.from(live.players.values()).filter((p) => p.id !== live.me));
    read(); const t = setInterval(read, 1000); return () => clearInterval(t);
  }, []);
  useEffect(() => {
    api<{ me: string; threads: { with: string; name: string; last: DmMessage; unread: number }[] }>("/api/dm").then((d) => { social.dm.me = d.me; social.dm.threads = d.threads; social.dm.unread = d.threads.reduce((a, t) => a + t.unread, 0); bumpSocial(); }).catch(() => {});
  }, []);
  const goTo = (p: LivePlayer) => { if (mode !== "walk") setMode("walk"); setWalkPoint({ x: p.x + 3, z: p.z + 1, face: { x: p.x, z: p.z } }); setPanel("none"); };
  const dist = (p: LivePlayer) => Math.round(Math.hypot(p.x - player.x, p.z - player.z));
  const spotLink = () => `${location.origin}/app?at=${player.x.toFixed(0)},${player.z.toFixed(0)}`;
  const copySpot = async () => { try { await navigator.clipboard.writeText(spotLink()); setToast("Link copied: anyone who opens it lands right here."); } catch { setToast(spotLink()); } };
  return (
    <>
      <PanelHeader title="People" sub={`${people.length} other${people.length === 1 ? "" : "s"} walking the floor`} />
      <div className="space-y-3 p-3">
        {!me && (
          <button onClick={() => setPanel("me")} className="w-full rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-left text-xs"><b className="text-amber-200">You're walking as "Visitor".</b> <span className="text-slate-300">Create a free account to set your name and title, add friends and keep your chats.</span></button>
        )}
        {mode === "walk" && <button onClick={() => void copySpot()} className="btn-ghost w-full text-xs">📍 Copy a link to where I'm standing</button>}
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">On the floor now</div>
          {people.length === 0 && <p className="text-xs text-slate-400">Nobody else right now. Share the link; everyone lands in the same hall.</p>}
          <div className="space-y-1">
            {people.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-2.5 py-1.5 text-sm">
                <span className={`h-2 w-2 shrink-0 rounded-full ${p.w ? "bg-slate-500" : "bg-emerald-300 shadow-[0_0_6px_#5ee6c3]"}`} />
                <span className="min-w-0 flex-1 truncate">{p.n}<span className="ml-1.5 text-[11px] text-slate-500">{p.w ? "away · in another tab" : mode === "walk" ? `${dist(p)} ft` : ""}</span></span>
                {(() => { const rel = relation(p.uid); return rel === "none" ? <button title="Add friend" onClick={() => void addFriend(p.uid!, p.n)} className="rounded-lg px-1.5 py-0.5 hover:bg-white/10">➕</button> : rel === "friend" ? <span title="Friend" className="px-1 text-[11px] text-emerald-300">🤝</span> : rel === "asked" ? <span title="Request sent" className="px-1 text-[11px] text-slate-500">sent</span> : rel === "pending" ? <span className="px-1 text-[11px] text-amber-300">asked you ↓</span> : !me && p.uid ? <button title="Sign in to add friends" onClick={() => setPanel("me")} className="rounded-lg px-1.5 py-0.5 text-slate-500 hover:bg-white/10">➕</button> : null; })()}
                <button title="Wave" onClick={() => fireReaction("👋")} className="rounded-lg px-1.5 py-0.5 hover:bg-white/10">👋</button>
                <button title="Message" onClick={() => openDm(p.id, p.n)} className="rounded-lg px-1.5 py-0.5 hover:bg-white/10">💬</button>
                <button title="Go to them" onClick={() => goTo(p)} className="rounded-lg px-1.5 py-0.5 hover:bg-white/10">🚶</button>
              </div>
            ))}
          </div>
        </div>
        {me && fr && (fr.incoming.length > 0 || fr.friends.length > 0 || fr.outgoing.length > 0) && (
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Friends</div>
            <div className="space-y-1">
              {fr.incoming.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-2.5 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate"><b>{p.name}</b> <span className="text-[11px] text-slate-400">wants to be friends</span></span>
                  <button onClick={() => void answer(p.requestId, true)} className="btn-primary px-2 py-0.5 text-xs">Accept</button>
                  <button onClick={() => void answer(p.requestId, false)} className="rounded-lg px-1.5 py-0.5 text-xs text-slate-400 hover:bg-white/10">Decline</button>
                </div>
              ))}
              {fr.friends.map((p) => { const here = onFloor(p.id); return (
                <div key={p.id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-2.5 py-1.5 text-sm">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${here ? "bg-emerald-300 shadow-[0_0_6px_#5ee6c3]" : "bg-slate-600"}`} />
                  <span className="min-w-0 flex-1 truncate">{p.name}<span className="ml-1.5 text-[11px] text-slate-500">{here ? (mode === "walk" ? `${dist(here)} ft` : "here") : "not on the floor"}</span></span>
                  {here && <button title="Message" onClick={() => openDm(here.id, here.n)} className="rounded-lg px-1.5 py-0.5 hover:bg-white/10">💬</button>}
                  {here && <button title="Go to them" onClick={() => goTo(here)} className="rounded-lg px-1.5 py-0.5 hover:bg-white/10">🚶</button>}
                  <button title="Remove friend" onClick={() => void unfriend(p)} className="rounded-lg px-1.5 py-0.5 text-slate-500 hover:bg-white/10">✕</button>
                </div>
              ); })}
              {fr.outgoing.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-2.5 py-1.5 text-sm text-slate-400">
                  <span className="min-w-0 flex-1 truncate">{p.name} <span className="text-[11px]">· request sent</span></span>
                  <button title="Withdraw" onClick={() => void api(`/api/friends?id=${p.id}`, { method: "DELETE" }).then(loadFriends)} className="rounded-lg px-1.5 py-0.5 hover:bg-white/10">✕</button>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">Friends can be put on a team in your dashboard, so they can sit at your booth.</p>
          </div>
        )}
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
