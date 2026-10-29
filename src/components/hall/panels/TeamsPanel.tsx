"use client";
/**
 * Teams, from the hall: the crews that staff your booths (they can sit at
 * the chairs), and the teams you are on. Friends by name, anyone by email.
 */
import { useEffect, useState } from "react";
import { api, useHall } from "@/lib/hall/store";
import { useSocial } from "@/lib/hall/social";
import { PanelHeader } from "./common";

interface TeamView { id: string; name: string; booths: number[]; members: Array<{ id: string; userId: string | null; email: string; name: string | null }> }
interface Person { id: string; name: string; handle: string | null }

export function TeamsPanel() {
  const me = useHall((s) => s.me);
  const myBooths = useHall((s) => s.myBooths);
  const setPanel = useHall((s) => s.setPanel);
  const setToast = useHall((s) => s.setToast);
  const setFlyTo = useHall((s) => s.setFlyTo);
  const select = useHall((s) => s.select);
  const soc = useSocial();
  const [teams, setTeams] = useState<TeamView[] | null>(null);
  const [friends, setFriends] = useState<Person[]>([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const owned = myBooths.filter((b) => b.role !== "staff");
  const staffed = myBooths.filter((b) => b.role === "staff");
  useEffect(() => {
    if (!me) return;
    api<{ teams: TeamView[] }>("/api/teams").then((d) => setTeams(d.teams)).catch(() => setTeams([]));
    api<{ friends: Person[] }>("/api/friends").then((d) => setFriends(d.friends)).catch(() => {});
  }, [me, soc.friendsVersion]);
  const run = async (f: () => Promise<{ teams: TeamView[] }>, ok?: string) => {
    setBusy(true);
    try { const d = await f(); setTeams(d.teams); if (ok) setToast(ok); } catch (e) { setToast((e as Error).message); }
    setBusy(false);
  };
  if (!me) {
    return (
      <>
        <PanelHeader title="Teams" sub="Crews that staff your booths" />
        <div className="space-y-3 p-3 text-sm">
          <p className="text-slate-300">Exhibitors put friends on a team so they can sit at the booth; team members see the booths they staff here.</p>
          <button onClick={() => setPanel("me")} className="btn-primary w-full">Sign in or create an account</button>
        </div>
      </>
    );
  }
  return (
    <>
      <PanelHeader title="Teams" sub={owned.length ? `${teams?.length ?? 0} team${teams?.length === 1 ? "" : "s"} · ${owned.length} booth${owned.length === 1 ? "" : "s"}` : "Crews that staff booths"} />
      <div className="space-y-3 p-3 text-sm">
        {staffed.length > 0 && (
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">You're on the crew at</div>
            <div className="space-y-1">
              {staffed.map((b) => (
                <button key={b.id} onClick={() => { select(b.id); setFlyTo(b.id); setPanel("none"); }} className="flex w-full items-center gap-2 rounded-xl bg-white/[0.04] px-2.5 py-1.5 text-left hover:bg-white/[0.08]">
                  <span className="h-3 w-3 rounded-sm" style={{ background: b.color }} />
                  <span className="min-w-0 flex-1 truncate">{b.name ?? `Booth #${b.id}`}<span className="ml-1.5 text-[11px] text-slate-500">{b.team}</span></span>
                  <span className="text-[11px] text-slate-400">walk there · press C to sit</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {owned.length === 0 ? (
          <p className="text-xs text-slate-400">Teams belong to booths. {staffed.length ? "Get a booth of your own to run a crew." : "Get a booth and you can put friends on a team so they can sit at your table."} <button onClick={() => setPanel("claim")} className="text-amber-300 underline">Claim one</button>.</p>
        ) : (
          <>
            <p className="text-xs text-slate-400">People on a team can sit at the chairs of the booths it staffs. Add friends by name (meet them under 👥 People) or anyone by email.</p>
            {teams === null && <p className="text-xs text-slate-500">Loading…</p>}
            {teams?.map((t) => <TeamCard key={t.id} t={t} booths={owned} friends={friends} busy={busy} run={run} />)}
            <form onSubmit={(e) => { e.preventDefault(); const name = newName.trim(); if (!name) return; void run(() => api("/api/teams", { method: "POST", body: JSON.stringify({ name }) }), `Team "${name}" created.`); setNewName(""); }} className="flex gap-1.5">
              <input value={newName} onChange={(e) => setNewName(e.target.value.slice(0, 40))} placeholder={teams?.length ? "Another team…" : "Name your first team, e.g. Booth crew"} className="input flex-1 text-sm" />
              <button className="btn-primary text-xs" disabled={busy || !newName.trim()}>Create</button>
            </form>
          </>
        )}
      </div>
    </>
  );
}

function TeamCard({ t, booths, friends, busy, run }: { t: TeamView; booths: Array<{ id: number; name: string | null; color: string }>; friends: Person[]; busy: boolean; run: (f: () => Promise<{ teams: TeamView[] }>, ok?: string) => Promise<void> }) {
  const [name, setName] = useState(t.name);
  const [email, setEmail] = useState("");
  const [friendId, setFriendId] = useState("");
  const [open, setOpen] = useState(true);
  const onTeam = new Set(t.members.map((m) => m.userId).filter(Boolean));
  const addable = friends.filter((f) => !onTeam.has(f.id));
  const toggleBooth = (id: number) => { const next = t.booths.includes(id) ? t.booths.filter((b) => b !== id) : [...t.booths, id]; void run(() => api(`/api/teams/${t.id}`, { method: "PATCH", body: JSON.stringify({ booths: next }) })); };
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
      <div className="flex items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} onBlur={() => { if (name.trim() && name !== t.name) void run(() => api(`/api/teams/${t.id}`, { method: "PATCH", body: JSON.stringify({ name }) })); }} className="input min-w-0 flex-1 text-sm font-semibold" title="Click to rename" />
        <button onClick={() => setOpen(!open)} className="rounded-lg px-1.5 py-0.5 text-xs text-slate-400 hover:bg-white/10">{open ? "▾" : "▸"} {t.members.length}</button>
      </div>
      {open && (
        <>
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Staffs</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {booths.map((b) => (
              <label key={b.id} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] ${t.booths.includes(b.id) ? "border-amber-300/50 bg-amber-300/10" : "border-white/10"}`}>
                <input type="checkbox" checked={t.booths.includes(b.id)} onChange={() => toggleBooth(b.id)} disabled={busy} /> <span className="h-2 w-2 rounded-sm" style={{ background: b.color }} /> {b.name || `#${b.id}`}
              </label>
            ))}
          </div>
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">People</div>
          {t.members.length === 0 && <p className="mt-1 text-[11px] text-slate-500">Nobody yet.</p>}
          <ul className="mt-1 space-y-1">
            {t.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2 py-1 text-[12px]">
                <span className="min-w-0 flex-1 truncate">{m.name ?? m.email}{!m.userId && <span className="ml-1.5 text-[10px] text-slate-500">invited</span>}</span>
                <button onClick={() => void run(() => api(`/api/teams/${t.id}/members?member=${m.id}`, { method: "DELETE" }))} className="rounded-md px-1.5 text-xs text-slate-400 hover:bg-white/10 hover:text-white" disabled={busy} aria-label="Remove">✕</button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-1.5">
            <select value={friendId} onChange={(e) => setFriendId(e.target.value)} className="input min-w-0 flex-1 text-xs" disabled={addable.length === 0}>
              <option value="">{friends.length === 0 ? "No friends yet" : addable.length === 0 ? "All friends are on it" : "Add a friend…"}</option>
              {addable.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <button onClick={() => { if (!friendId) return; void run(() => api(`/api/teams/${t.id}/members`, { method: "POST", body: JSON.stringify({ userId: friendId }) }), "Added. They can sit at your booth now."); setFriendId(""); }} className="btn-ghost text-xs" disabled={busy || !friendId}>Add</button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); const v = email.trim(); if (!v) return; void run(() => api(`/api/teams/${t.id}/members`, { method: "POST", body: JSON.stringify({ email: v }) }), `${v} invited.`); setEmail(""); }} className="mt-1.5 flex gap-1.5">
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="or invite by email" className="input min-w-0 flex-1 text-xs" />
            <button className="btn-ghost text-xs" disabled={busy || !email.trim()}>Invite</button>
          </form>
          <button onClick={() => { if (confirm(`Delete team "${t.name}"?`)) void run(() => api(`/api/teams/${t.id}`, { method: "DELETE" }), "Team deleted."); }} className="mt-2 text-[11px] text-rose-300/80 hover:text-rose-300" disabled={busy}>Delete team</button>
        </>
      )}
    </div>
  );
}
