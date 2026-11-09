"use client";
/**
 * Block and report, shared by People, Messages and chat. Blocking needs an account (the list is kept on it). A block
 * hides the person's chat here and makes the server refuse their messages and friend requests. A report goes to the
 * admins with a reason and the last things the person said.
 */
import { useState } from "react";
import { api, useHall } from "@/lib/hall/store";
import { REPORT_REASONS, type ReportReason } from "@/lib/report-reasons";

export interface Someone { uid?: string | null; pid?: string | null; name: string }
const REASON_LABEL: Record<ReportReason, string> = { harassment: "Harassment or threats", spam: "Spam or scams", impersonation: "Impersonating someone", adult: "Adult or hateful content", other: "Something else" };

/** Block or unblock someone. Returns the new state, or null when it could not be done (signed out, failed). */
export async function toggleBlock(who: Someone): Promise<boolean | null> {
  const st = useHall.getState();
  if (!st.me) { st.setPanel("me"); st.setToast("Sign in to block people. It takes a moment."); return null; }
  const on = !st.isBlocked({ uid: who.uid, id: who.pid });
  try {
    const r = await api<{ uids: string[]; pids: string[] }>("/api/block", { method: "POST", body: JSON.stringify({ uid: who.uid ?? null, pid: who.pid ?? null, name: who.name, on }) });
    st.setBlocked(r);
    st.setToast(on ? `🚫 ${who.name} is blocked. You won't see their chat and they can't message you.` : `${who.name} is unblocked.`);
    return on;
  } catch (e) { st.setToast((e as Error).message); return null; }
}

/** The report form, opened from a person's row or a message thread. `context` is the last things they said, if any. */
export function ReportDialog({ who, context, onClose }: { who: Someone; context?: string; onClose: () => void }) {
  const me = useHall((s) => s.me);
  const setPanel = useHall((s) => s.setPanel);
  const setToast = useHall((s) => s.setToast);
  const [reason, setReason] = useState<ReportReason>("harassment");
  const [details, setDetails] = useState("");
  const [also, setAlso] = useState(true);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!me) { setPanel("me"); return; }
    setBusy(true);
    try {
      await api("/api/report", { method: "POST", body: JSON.stringify({ uid: who.uid ?? null, pid: who.pid ?? null, name: who.name, reason, details, context }) });
      if (also) await toggleBlock(who);
      setToast(`⚑ Reported ${who.name}. The admins have it; thank you.`);
      onClose();
    } catch (e) { setToast((e as Error).message); }
    setBusy(false);
  };
  return (
    <div data-report-dialog className="rounded-xl border border-rose-300/30 bg-rose-400/10 p-3 text-sm">
      <div className="font-semibold">Report {who.name}</div>
      {!me ? <p className="mt-1 text-xs text-slate-300">Sign in to report someone; it keeps reports honest.</p> : (
        <>
          <div className="mt-2 grid gap-1">
            {REPORT_REASONS.map((r) => <label key={r} className="flex cursor-pointer items-center gap-2 text-xs"><input type="radio" name="report-reason" checked={reason === r} onChange={() => setReason(r)} /> {REASON_LABEL[r]}</label>)}
          </div>
          <textarea className="input mt-2 text-xs" rows={2} maxLength={600} placeholder="What happened? (optional)" value={details} onChange={(e) => setDetails(e.target.value)} />
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={also} onChange={(e) => setAlso(e.target.checked)} /> Also block {who.name}</label>
          {context && <p className="mt-1 text-[11px] text-slate-400">Their last messages go with the report.</p>}
        </>
      )}
      <div className="mt-2 flex gap-2">
        {me ? <button className="btn-primary text-xs" disabled={busy} onClick={() => void send()}>Send report</button> : <button className="btn-primary text-xs" onClick={() => setPanel("me")}>Sign in</button>}
        <button className="btn-ghost text-xs" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
