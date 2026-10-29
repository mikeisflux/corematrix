"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, useHall } from "@/lib/hall/store";
import { formatMoney, REFERRAL_CREDIT_CENTS, REFERRAL_COINS } from "@/lib/config";
import { timeAgo } from "@/lib/util";
import { PanelHeader, SignIn, Stat } from "./common";
import { ChangePassword, VerifyNudge } from "@/components/ui/AuthForms";
import { NOTICE_ICON } from "@/lib/hall/notices";
import { useSocial } from "@/lib/hall/social";

interface N { type: string; id: string; title: string; body: string | null; boothId: number | null; readAt: number | null; createdAt: number }

export function MePanel() {
  const me = useHall((s) => s.me);
  const myBooths = useHall((s) => s.myBooths);
  const select = useHall((s) => s.select);
  const setFlyTo = useHall((s) => s.setFlyTo);
  const [notes, setNotes] = useState<N[]>([]);
  const soc = useSocial();
  useEffect(() => {
    if (!me) return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    void soc.noticeVersion;
    // read the list first, then mark it read: the other order could mark a notice read before it was ever shown
    let on = true;
    // mark read only what was shown (up to the newest one listed), then clear the badge
    api<{ notifications: N[] }>("/api/notifications").then(async (d) => {
      if (!on) return; setNotes(d.notifications);
      const newest = d.notifications.reduce((a, n) => Math.max(a, n.createdAt), 0);
      if (newest) await api("/api/notifications", { method: "POST", body: JSON.stringify({ upTo: newest }) });
      const st = useHall.getState(); if (on && st.me && st.me.unread) st.setMe({ ...st.me, unread: 0 }, st.myBooths);
    }).catch(() => {});
    return () => { on = false; };
  }, [me?.id, soc.noticeVersion]); // the id, not the object: clearing the badge replaces the object
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
        {me.emailVerified === false && <VerifyNudge email={me.email} compact />}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Coins" value={String(me.coins)} sub={`${me.streak}-day streak`} accent />
          <Stat label="Credit" value={formatMoney(Math.max(0, me.creditCents + (me.promoCents ?? 0)))} sub={me.promoCents ? `${formatMoney(me.promoCents)} referral (spend-only)` : "from sales + referrals"} />
          <Stat label="Booths" value={String(myBooths.length)} />
        </div>
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs">
          <b>Refer a friend: you both get {formatMoney(REFERRAL_CREDIT_CENTS)} credit + {REFERRAL_COINS} coins when they make their first purchase.</b>
          <div className="mt-1 flex gap-2"><input readOnly className="input text-[11px]" value={refLink} /><button className="btn-ghost text-xs" onClick={() => { navigator.clipboard?.writeText(refLink); useHall.getState().setToast("Referral link copied"); }}>Copy</button></div>
        </div>
        {myBooths.length > 0 ? (
          <ul className="space-y-1">
            {myBooths.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] p-2">
                <button onClick={() => { select(p.id); setFlyTo(p.id); }} className="h-8 w-8 rounded-lg" style={{ background: p.color }} />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{p.name}</div><div className="text-[11px] text-slate-400">Booth #{p.id} · {p.role === "staff" ? `on ${p.team ?? "a team"} · you can sit here` : formatMoney(p.valueCents)}</div></div>
                {p.role !== "staff" && <a href={`/app/dashboard?booth=${p.id}`} className="btn-ghost text-xs">Manage</a>}
              </li>
            ))}
          </ul>
        ) : (
          <button onClick={() => useHall.getState().setPanel("claim")} className="btn-primary w-full">Claim your first booth →</button>
        )}
        <a href="/app/dashboard" className="btn-ghost w-full">Open dashboard</a>
        {notes.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Notifications</div>
            <ul className="mt-1 space-y-1">
              {notes.slice(0, 30).map((n) => (
                <li key={n.id} className={`rounded-lg px-2 py-1.5 text-xs ${n.readAt ? "bg-white/[0.03]" : "bg-amber-300/10"}`}><div className="font-semibold"><span className="mr-1">{NOTICE_ICON[n.type] ?? "🔔"}</span>{n.title}</div>{n.body && <div className="text-slate-300">{n.body}</div>}<div className="text-[10px] text-slate-500">{timeAgo(n.createdAt)}</div></li>
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
