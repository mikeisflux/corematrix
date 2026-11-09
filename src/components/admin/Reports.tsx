"use client";
import Link from "next/link";
import { Fragment, useState } from "react";
import { useJson, PageHead, Badge, DateTime, Empty, api, useToast } from "./shared";

interface Row { id: string; reason: string; details: string; context: string; status: string; createdAt: number; targetName: string; targetUserId: string | null; targetPlayerId: string | null; reporterId: string; reporter: { id: string; email: string; displayName: string | null } | null; target: { id: string; email: string; displayName: string | null } | null }

/** Reports visitors filed about people: who, why, what was said. Resolve when dealt with (a note to the person, a hidden booth, a ban). */
export default function Reports() {
  const [status, setStatus] = useState<"open" | "resolved" | "all">("open");
  const list = useJson<{ rows: Row[] }>(`/api/admin/reports?status=${status}`);
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const resolve = async (r: Row) => { try { await api("/api/admin/reports", { method: "PATCH", body: JSON.stringify({ id: r.id, reopen: r.status === "resolved" }) }); list.reload(); } catch (e) { toast.err((e as Error).message); } };
  return (
    <>
      <PageHead title="Reports" sub="What visitors reported about other people on the floor. Each one names the person, the reason, and the last things they said as the reporter saw them.">
        <div className="admRow">{(["open", "resolved", "all"] as const).map((s) => <button key={s} className={`admBtn admBtn--sm ${status === s ? "admBtn--primary" : ""}`} onClick={() => setStatus(s)}>{s}</button>)}</div>
      </PageHead>
      {list.error && <div className="admNote admNote--err">{list.error}</div>}
      <div className="admCard">
        {list.data && list.data.rows.length === 0 && <Empty>No {status === "all" ? "" : status} reports.</Empty>}
        {list.data && list.data.rows.length > 0 && (
          <div className="admTableWrap"><table className="admTable">
            <thead><tr><th>When</th><th>Reported</th><th>Reason</th><th>By</th><th>Status</th><th></th></tr></thead>
            <tbody>{list.data.rows.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <td><DateTime value={r.createdAt} /></td>
                  <td>{r.target ? <Link href={`/admin/users/${r.target.id}`}>{r.target.displayName || r.target.email}</Link> : <>{r.targetName || "a guest"} <Badge kind="dim">guest</Badge></>}{r.targetPlayerId && <div className="admMuted" style={{ fontSize: 11 }}>player {r.targetPlayerId}</div>}</td>
                  <td><Badge kind={r.reason === "harassment" ? "hot" : undefined}>{r.reason}</Badge>{r.details && <div style={{ fontSize: 12, marginTop: 4 }}>{r.details}</div>}</td>
                  <td>{r.reporter ? <Link href={`/admin/users/${r.reporter.id}`}>{r.reporter.displayName || r.reporter.email}</Link> : r.reporterId}</td>
                  <td>{r.status === "open" ? <Badge kind="hot">open</Badge> : <Badge kind="dim">resolved</Badge>}</td>
                  <td className="admRow">{r.context && <button className="admBtn admBtn--sm" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide" : "What they said"}</button>}<button className="admBtn admBtn--sm" onClick={() => void resolve(r)}>{r.status === "open" ? "Resolve" : "Reopen"}</button></td>
                </tr>
                {open === r.id && <tr><td colSpan={6}><pre className="admPre" style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{r.context}</pre></td></tr>}
              </Fragment>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
