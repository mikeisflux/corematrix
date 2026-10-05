"use client";
import { useState } from "react";
import { useJson, api, useToast, Pager, PageHead, Badge, DateTime, Select, Money, Empty, qs, Input } from "./shared";
interface Row { id: string; userId: string; email: string | null; displayName: string | null; creditCents: number | null; amountCents: number; paypalEmail: string; legalName: string; address: string; status: string; reference: string | null; note: string | null; createdAt: number; resolvedAt: number | null }
interface Resp { rows: Row[]; total: number; pages: number; totals: { owedCents: number; owedCount: number; paidCents: number; paidCount: number; creditOutstandingCents: number } }
export default function Payouts({ initialStatus = "pending" }: { initialStatus?: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [page, setPage] = useState(1);
  const [ref, setRef] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const list = useJson<Resp>(`/api/admin/payouts?${qs({ status, page })}`);
  const toast = useToast();
  const act = async (id: string, body: Record<string, string>) => {
    try { await api(`/api/admin/payouts/${id}`, { method: "POST", json: body }); toast.ok(body.action === "paid" ? "Marked paid and the user was emailed" : "Rejected; credit returned"); list.reload(); }
    catch (e) { toast.err((e as Error).message); }
  };
  const t = list.data?.totals;
  return (
    <>
      {toast.node}
      <PageHead title="Payouts" sub="Cash-outs of user credit to PayPal. The credit left the user's balance when they asked; send the money from the company PayPal (Send → to the email shown), then paste the transaction id and mark it paid. Rejecting returns the credit.">
        <button className="admBtn" onClick={list.reload}>Refresh</button>
      </PageHead>
      {t && (
        <div className="admGrid">
          <div className="admTile"><div className="admTile__label">Owed now</div><div className="admTile__value"><Money cents={t.owedCents} /></div><div className="admTile__sub">{t.owedCount} waiting</div></div>
          <div className="admTile"><div className="admTile__label">Paid out, lifetime</div><div className="admTile__value"><Money cents={t.paidCents} /></div><div className="admTile__sub">{t.paidCount} payouts</div></div>
          <div className="admTile"><div className="admTile__label">Credit on accounts</div><div className="admTile__value"><Money cents={t.creditOutstandingCents} /></div><div className="admTile__sub">could be requested later</div></div>
        </div>
      )}
      <div className="admCard">
        <div className="admFilters">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={[{ value: "", label: "All" }, "pending", "paid", "rejected"]} />
        </div>
        {list.error && <div className="admNote admNote--err">{list.error}</div>}
        {list.data && list.data.rows.length === 0 && <Empty>No payouts {status ? `with status ${status}` : "yet"}.</Empty>}
        <div className="admTableWrap"><table className="admTable">
          <thead><tr><th>Requested</th><th>User</th><th>Amount</th><th>Send to (PayPal)</th><th>Legal name · address</th><th>Status</th><th></th></tr></thead>
          <tbody>{list.data?.rows.map((r) => (
            <tr key={r.id}>
              <td><DateTime value={r.createdAt} /><div className="admMuted admMono" style={{ fontSize: 11 }}>{r.id}</div></td>
              <td><a href={`/admin/users/${r.userId}`}>{r.displayName || r.email || r.userId}</a><div className="admMuted" style={{ fontSize: 11 }}>{r.email}</div></td>
              <td><b><Money cents={r.amountCents} /></b></td>
              <td className="admMono">{r.paypalEmail}</td>
              <td style={{ maxWidth: 260 }}>{r.legalName}<div className="admMuted" style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>{r.address}</div></td>
              <td><Badge kind={r.status === "paid" ? "ok" : r.status === "rejected" ? "err" : "warn"}>{r.status}</Badge>{r.reference && <div className="admMono" style={{ fontSize: 11 }}>{r.reference}</div>}{r.note && <div className="admMuted" style={{ fontSize: 11 }}>{r.note}</div>}{r.resolvedAt && <div className="admMuted" style={{ fontSize: 11 }}><DateTime value={r.resolvedAt} /></div>}</td>
              <td>
                {r.status === "pending" && (
                  <div className="admStack" style={{ minWidth: 220 }}>
                    <div className="admRow"><Input placeholder="PayPal transaction id" value={ref[r.id] ?? ""} onChange={(e) => setRef({ ...ref, [r.id]: e.target.value })} /><button className="admBtn admBtn--primary admBtn--sm" disabled={!(ref[r.id] ?? "").trim()} onClick={() => act(r.id, { action: "paid", reference: ref[r.id] })}>Mark paid</button></div>
                    <div className="admRow"><Input placeholder="Reason" value={reason[r.id] ?? ""} onChange={(e) => setReason({ ...reason, [r.id]: e.target.value })} /><button className="admBtn admBtn--sm" onClick={() => { if (confirm(`Reject and return ${(r.amountCents / 100).toFixed(2)} of credit?`)) void act(r.id, { action: "reject", reason: reason[r.id] ?? "" }); }}>Reject</button></div>
                  </div>
                )}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
        {list.data && <Pager page={page} pages={list.data.pages} total={list.data.total} onPage={setPage} />}
      </div>
    </>
  );
}
