"use client";
/** The card for one person on the floor: who they are, what they wear, their booth and arcade bests, and what you can do with them. */
import { useEffect, useState } from "react";
import { api, useHall } from "@/lib/hall/store";
import { live } from "@/lib/hall/live";
import { social, useSocial } from "@/lib/hall/social";
import { COSTUMES } from "@/lib/hall/costumes";
import { openDm, player } from "../Avatar";
import { PanelHeader } from "./common";
import { ReportDialog, toggleBlock } from "./Safety";

interface Profile { id: string; name: string; handle: string | null; title: string | null; since: number; streak: number; booths: Array<{ id: number; name: string; hall: string; category: string }>; bests: Array<{ game: string; best: number }>; friends: number }
interface Friends { friends: Array<{ id: string }>; incoming: Array<{ id: string; requestId: string }>; outgoing: Array<{ id: string }> }
const HAIR: Record<string, string> = { short: "parted", long: "long", buzz: "buzz cut", bun: "buns", curly: "curly", bald: "no hair" };

export function PlayerPanel() {
  const card = social.card;
  const me = useHall((s) => s.me);
  const mode = useHall((s) => s.mode);
  const setMode = useHall((s) => s.setMode);
  const setWalkPoint = useHall((s) => s.setWalkPoint);
  const setPanel = useHall((s) => s.setPanel);
  const select = useHall((s) => s.select);
  const booths = useHall((s) => s.booths);
  const setToast = useHall((s) => s.setToast);
  const blocked = useHall((s) => s.blocked);
  const isBlocked = useHall((s) => s.isBlocked);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({}); // by account id: a reopened card shows at once
  const [fr, setFr] = useState<Friends | null>(null);
  const soc = useSocial();
  const [reporting, setReporting] = useState(false);
  const [tick, setTick] = useState(0);
  const uid = card?.uid ?? null;
  const profile = uid ? profiles[uid] ?? null : null;
  useEffect(() => { if (uid) api<Profile>(`/api/people/${uid}`).then((p) => setProfiles((m) => ({ ...m, [uid]: p }))).catch(() => {}); }, [uid]);
  const friendsVersion = soc.friendsVersion;
  useEffect(() => { if (me && uid) api<Friends>("/api/friends").then(setFr).catch(() => {}); }, [me, uid, friendsVersion]);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  if (!card) return <><PanelHeader title="Person" onBack={() => setPanel("people")} /><p className="p-3 text-xs text-slate-400">Click someone on the floor to see their card.</p></>;
  const here = live.players.get(card.id); void tick;
  const name = here?.n ?? profile?.name ?? card.name;
  const title = here?.j ?? profile?.title ?? null;
  const a = here?.a;
  const costume = a?.costume && a.costume !== "none" ? COSTUMES[a.costume]?.name : null;
  const dist = here && mode === "walk" ? Math.round(Math.hypot(here.x - player.x, here.z - player.z)) : null;
  const rel = !uid || !me ? null : uid === me.id ? "me" : !fr ? "none" : fr.friends.some((f) => f.id === uid) ? "friend" : fr.incoming.some((f) => f.id === uid) ? "pending" : fr.outgoing.some((f) => f.id === uid) ? "asked" : "none";
  const addFriend = async () => { try { const r = await api<{ status: string }>("/api/friends", { method: "POST", body: JSON.stringify({ to: uid }) }); setToast(r.status === "accepted" ? `🤝 You and ${name} are friends now` : `🤝 Friend request sent to ${name}`); setFr(await api<Friends>("/api/friends")); } catch (e) { setToast((e as Error).message); } };
  const accept = async () => { const req = fr?.incoming.find((f) => f.id === uid); if (!req) return; try { await api("/api/friends", { method: "PATCH", body: JSON.stringify({ id: req.requestId, accept: true }) }); setFr(await api<Friends>("/api/friends")); } catch (e) { setToast((e as Error).message); } };
  const goTo = () => { if (!here) return; if (mode !== "walk") setMode("walk"); setWalkPoint({ x: here.x + 3, z: here.z + 1, face: { x: here.x, z: here.z } }); setPanel("none"); };
  const blockedNow = isBlocked({ uid, id: card.id }); void blocked;
  return (
    <>
      <PanelHeader title={name} sub={title ?? (uid ? "Visitor with an account" : "Guest on the floor")} onBack={() => setPanel("people")} />
      <div className="space-y-3 p-3 text-sm">
        <div className="flex items-center gap-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${here ? (here.w ? "bg-slate-500" : "bg-emerald-300 shadow-[0_0_6px_#5ee6c3]") : "bg-slate-600"}`} />
          <span className="text-slate-300">{here ? (here.w ? "On the floor, away in another tab" : "On the floor now") : "Not on the floor right now"}{dist != null && !here?.w ? ` · ${dist} ft from you` : ""}</span>
        </div>
        {profile?.handle && <div className="text-xs text-slate-400">@{profile.handle}</div>}
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          {a && <div className="rounded-xl bg-white/[0.04] p-2"><div className="text-[10px] uppercase tracking-wider text-slate-500">Wearing</div>{costume ? <div>{costume}</div> : <div>Own clothes</div>}<div className="text-slate-400">{a.vrm ? "Their own 3D model" : `${HAIR[a.hair] ?? a.hair} hair`}</div></div>}
          {profile && <div className="rounded-xl bg-white/[0.04] p-2"><div className="text-[10px] uppercase tracking-wider text-slate-500">Member</div><div>since {new Date(profile.since).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</div><div className="text-slate-400">{profile.friends} friend{profile.friends === 1 ? "" : "s"}{profile.streak > 1 ? ` · ${profile.streak}-day streak` : ""}</div></div>}
        </div>
        {profile && profile.booths.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Exhibitor</div>
            {profile.booths.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.04] px-2.5 py-1.5"><span className="min-w-0 truncate">{b.name} <span className="text-[11px] text-slate-500">Hall {b.hall} · {b.category}</span></span>{booths.has(b.id) ? <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => select(b.id)}>Open booth</button> : <a className="btn-ghost px-2 py-0.5 text-xs" href={`/app/booth/${b.id}`}>Open booth</a>}</div>
            ))}
          </div>
        )}
        {profile && profile.bests.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Arcade bests</div>
            <ul className="space-y-0.5 text-xs">{profile.bests.map((b) => <li key={b.game} className="flex justify-between"><span>{b.game}</span><span className="mono">{b.best.toLocaleString()}</span></li>)}</ul>
          </div>
        )}
        {rel !== "me" && (
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <button className="btn-primary py-1.5" onClick={() => openDm(card.id, name)} disabled={blockedNow}>💬 Message</button>
            <button className="btn-ghost py-1.5" onClick={goTo} disabled={!here}>🚶 Go to them</button>
            {uid && me && rel === "none" && <button className="btn-ghost py-1.5" onClick={() => void addFriend()}>➕ Add friend</button>}
            {uid && me && rel === "asked" && <span className="rounded-xl bg-white/5 px-2 py-1.5 text-center text-slate-400">Friend request sent</span>}
            {uid && me && rel === "pending" && <button className="btn-ghost py-1.5" onClick={() => void accept()}>🤝 Accept their request</button>}
            {uid && me && rel === "friend" && <span className="rounded-xl bg-emerald-300/10 px-2 py-1.5 text-center text-emerald-300">🤝 Friends</span>}
            {uid && !me && <button className="btn-ghost py-1.5" onClick={() => setPanel("me")}>➕ Sign in to add friends</button>}
            <button className="btn-ghost py-1.5 text-slate-300" onClick={() => void toggleBlock({ uid, pid: card.id, name })}>{blockedNow ? "Unblock" : "🚫 Block"}</button>
            <button className="btn-ghost py-1.5 text-slate-300" onClick={() => setReporting(true)}>⚑ Report</button>
          </div>
        )}
        {rel === "me" && <p className="text-xs text-slate-400">That is you. Your own look and name are in 🧑‍🎤 Avatar.</p>}
        {reporting && <ReportDialog who={{ uid, pid: card.id, name }} onClose={() => setReporting(false)} />}
      </div>
    </>
  );
}
