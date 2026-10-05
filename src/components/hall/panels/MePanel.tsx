"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, useHall } from "@/lib/hall/store";
import { formatMoney } from "@/lib/config";
import { timeAgo } from "@/lib/util";
import { PanelHeader, SignIn, Stat } from "./common";
import { ChangePassword } from "@/components/ui/AuthForms";

interface N { id: string; title: string; body: string | null; boothId: number | null; readAt: number | null; createdAt: number }

export function MePanel() {
  const me = useHall((s) => s.me);
  const myBooths = useHall((s) => s.myBooths);
  const select = useHall((s) => s.select);
  const setFlyTo = useHall((s) => s.setFlyTo);
  const [notes, setNotes] = useState<N[]>([]);
  useEffect(() => {
    if (!me) return;
    api<{ notifications: N[] }>("/api/notifications").then((d) => setNotes(d.notifications));
    void api("/api/notifications", { method: "POST" });
  }, [me]);
  if (!me) {
    return (
      <>
        <PanelHeader title="Sign in" sub="Owners, players and advertisers" />
        <div className="p-3"><SignIn note="Sign in or create an account to claim a booth, earn coins and chat." /></div>
      </>
    );
  }
  const refLink = `${typeof window !== "undefined" ? window.location.origin : ""}/?ref=${me.referralCode}`;
  return (
    <>
      <PanelHeader title={me.displayName ?? me.email} sub={me.email} />
      <div className="space-y-3 p-3">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Coins" value={String(me.coins)} sub={`${me.streak}-day streak`} accent />
          <Stat label="Credit" value={formatMoney(me.creditCents)} sub="from sales + referrals" />
          <Stat label="Booths" value={String(myBooths.length)} />
        </div>
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs">
          <b>Refer a friend, both get $2 credit + 25 coins.</b>
          <div className="mt-1 flex gap-2"><input readOnly className="input text-[11px]" value={refLink} /><button className="btn-ghost text-xs" onClick={() => { navigator.clipboard?.writeText(refLink); useHall.getState().setToast("Referral link copied"); }}>Copy</button></div>
        </div>
        {myBooths.length > 0 ? (
          <ul className="space-y-1">
            {myBooths.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] p-2">
                <button onClick={() => { select(p.id); setFlyTo(p.id); }} className="h-8 w-8 rounded-lg" style={{ background: p.color }} />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{p.name}</div><div className="text-[11px] text-slate-400">Booth #{p.id} · {formatMoney(p.valueCents)}</div></div>
                <Link href={`/app/dashboard?booth=${p.id}`} className="btn-ghost text-xs">Manage</Link>
              </li>
            ))}
          </ul>
        ) : (
          <button onClick={() => useHall.getState().setPanel("claim")} className="btn-primary w-full">Claim your first booth →</button>
        )}
        <Link href="/app/dashboard" className="btn-ghost w-full">Open dashboard</Link>
        {notes.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Notifications</div>
            <ul className="mt-1 space-y-1">
              {notes.slice(0, 8).map((n) => (
                <li key={n.id} className={`rounded-lg px-2 py-1.5 text-xs ${n.readAt ? "bg-white/[0.03]" : "bg-amber-300/10"}`}><div className="font-semibold">{n.title}</div>{n.body && <div className="text-slate-300">{n.body}</div>}<div className="text-[10px] text-slate-500">{timeAgo(n.createdAt)}</div></li>
              ))}
            </ul>
          </div>
        )}
        <details className="rounded-xl bg-white/[0.04] p-2 text-xs"><summary className="cursor-pointer text-slate-300">Change password</summary><div className="mt-2"><ChangePassword /></div></details>
        <form action="/api/auth/signout" method="post"><button className="w-full text-xs text-slate-400 hover:text-white">Sign out</button></form>
      </div>
    </>
  );
}
