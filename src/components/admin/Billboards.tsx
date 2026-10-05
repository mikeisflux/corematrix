"use client";
import Link from "next/link";
import { useJson, api, useToast, PageHead, Badge, Money, DateTime, ConfirmButton, Empty } from "./shared";
interface Row { id: string; slot: string; headline: string; body: string | null; website: string | null; imageUrl: string | null; color: string; startsAt: number; endsAt: number; amountCents: number; seen: number; opens: number; clicks: number; status: string; createdAt: number; ownerId: string; ownerEmail: string | null; plotId: number | null }
export default function Billboards() {
  const d = useJson<{ rows: Row[] }>("/api/admin/billboards");
  const toast = useToast();
  const act = async (id: string, action: string, days?: number) => { try { await api("/api/admin/billboards", { method: "POST", json: { id, action, days } }); toast.ok(`Billboard ${action}`); d.reload(); } catch (e) { toast.err(e); } };
  return (
    <>
      {toast.node}
      <PageHead title="Billboards" sub="Sponsor placements in the hall. Reject anything that breaks the rules; it goes dark immediately (refund from its transaction if needed).">
        <button className="admBtn" onClick={() => d.reload()}>Refresh</button>
      </PageHead>
      {d.error && <div className="admNote admNote--err">{d.error}</div>}
      <div className="admCard">
        <div className="admTableWrap"><table className="admTable">
          <thead><tr><th>Creative</th><th>Slot</th><th>Sponsor</th><th>Status</th><th>Runs</th><th>Paid</th><th>Seen</th><th>Opens</th><th>Clicks</th><th></th></tr></thead>
          <tbody>{d.data?.rows.map((b) => (
            <tr key={b.id}>
              <td><div className="admRow"><span style={{ width: 14, height: 14, background: b.color, display: "inline-block", border: "1px solid var(--rule)" }} /><b>{b.headline}</b></div><div className="admMuted">{b.body}</div>{b.website && <a className="admMuted admMono" href={b.website} target="_blank" rel="noreferrer">{b.website}</a>}</td>
              <td className="admMono">{b.slot}</td><td className="admMono"><Link href={`/admin/users/${b.ownerId}`}>{b.ownerEmail || b.ownerId}</Link></td>
              <td><Badge kind={b.status === "active" ? "ok" : b.status === "rejected" ? "bad" : "dim"}>{b.status}</Badge></td>
              <td><DateTime value={b.startsAt} dateOnly /> → <DateTime value={b.endsAt} dateOnly /></td>
              <td className="num"><Money cents={b.amountCents} /></td><td className="num">{b.seen.toLocaleString()}</td><td className="num">{b.opens}</td><td className="num">{b.clicks}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                {b.status === "active" && <ConfirmButton className="admBtn admBtn--sm admBtn--danger" message="Reject this billboard? It stops showing immediately." onConfirm={() => act(b.id, "reject")}>Reject</ConfirmButton>}{" "}
                {b.status === "active" && <ConfirmButton className="admBtn admBtn--sm" message="End this billboard now?" onConfirm={() => act(b.id, "end")}>End</ConfirmButton>}{" "}
                {b.status !== "active" && <button className="admBtn admBtn--sm" onClick={() => act(b.id, "activate")}>Activate</button>}{" "}
                <button className="admBtn admBtn--sm" onClick={() => act(b.id, "extend", 7)}>+7d</button>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
        {d.data && d.data.rows.length === 0 && <Empty>No billboards bought yet.</Empty>}
      </div>
    </>
  );
}
