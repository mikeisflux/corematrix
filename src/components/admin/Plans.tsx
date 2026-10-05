"use client";
import Link from "next/link";
import { useState } from "react";
import { useJson, api, useToast, PageHead, Badge, Money, DateTime, ConfirmButton, Select, Empty } from "./shared";
interface Row { id: number; name: string | null; tier: string; tierUntil: number | null; subscriptionId: string | null; subscriptionStatus: string | null; ownerId: string | null; ownerEmail: string | null; hasCard: boolean; priceCents: number; overdue: boolean }
interface Resp { rows: Row[]; mrr: number; renewals: { id: string; plotId: number; status: string; amountCents: number; createdAt: number; notes: string | null }[]; tiers: { id: string; name: string; priceCents: number }[] }
export default function Plans() {
  const [status, setStatus] = useState("");
  const d = useJson<Resp>(`/api/admin/plans${status ? `?status=${status}` : ""}`);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const act = async (json: Record<string, unknown>, msg: string) => { setBusy(true); try { const r = await api<Record<string, unknown>>("/api/admin/plans", { method: "POST", json }); toast.ok(json.action === "run_renewals" ? `Renewals: ${JSON.stringify(r)}` : msg); d.reload(); } catch (e) { toast.err(e); } finally { setBusy(false); } };
  return (
    <>
      {toast.node}
      <PageHead title="Plans" sub="Pro and Landmark subscriptions billed every 30 days by charging the saved DivinityCoin card. Renewals run from the daily cron; you can run them now.">
        {d.data && <span className="admLabel">MRR <Money cents={d.data.mrr} /></span>}
        <ConfirmButton className="admBtn admBtn--primary" disabled={busy} message="Run plan renewals now? Due plans are charged, failed ones marked past due, lapsed ones downgraded." onConfirm={() => act({ action: "run_renewals" }, "Done")}>Run renewals</ConfirmButton>
      </PageHead>
      <div className="admCard">
        <div className="admFilters"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: "", label: "All statuses" }, "active", "canceling", "past_due", "canceled"]} /></div>
        {d.error && <div className="admNote admNote--err">{d.error}</div>}
        <div className="admTableWrap"><table className="admTable">
          <thead><tr><th>Booth</th><th>Owner</th><th>Plan</th><th>Status</th><th>Renews</th><th>Card</th><th>Ref</th><th></th></tr></thead>
          <tbody>{d.data?.rows.map((r) => (
            <tr key={r.id}><td><Link href={`/admin/booths/${r.id}`}>#{r.id} {r.name}</Link></td><td className="admMono">{r.ownerEmail || "—"}</td><td><Badge>{r.tier}</Badge> <span className="admMuted"><Money cents={r.priceCents} />/30d</span></td><td><Badge kind={r.subscriptionStatus === "past_due" ? "bad" : r.subscriptionStatus === "active" ? "ok" : "dim"}>{r.subscriptionStatus || "—"}</Badge></td><td style={r.overdue ? { color: "var(--heat-6)" } : undefined}><DateTime value={r.tierUntil} /></td><td>{r.hasCard ? "✓" : <span className="admMuted">none</span>}</td><td className="admMono admMuted" style={{ fontSize: 11 }}>{r.subscriptionId}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                {r.hasCard && r.subscriptionStatus !== "canceled" && <ConfirmButton className="admBtn admBtn--sm" message={`Charge ${r.ownerEmail} now for the next period?`} onConfirm={() => act({ action: "charge", plotId: r.id }, "Charged")}>Charge</ConfirmButton>}{" "}
                <button className="admBtn admBtn--sm" onClick={() => act({ action: "extend", plotId: r.id, days: 30 }, "Extended 30 days")}>+30d</button>{" "}
                {r.subscriptionStatus !== "canceled" && <ConfirmButton className="admBtn admBtn--sm admBtn--danger" message="Cancel this plan at the end of the current period?" onConfirm={() => act({ action: "cancel", plotId: r.id }, "Canceled")}>Cancel</ConfirmButton>}
              </td></tr>
          ))}</tbody>
        </table></div>
        {d.data && d.data.rows.length === 0 && <Empty>No paid plans yet.</Empty>}
      </div>
      <div className="admSplit">
        <div className="admCard">
          <div className="admCard__hd"><h2 className="admH2">Comp a plan</h2></div>
          <p className="admHint">Give a booth Pro or Landmark for free for N days (no card needed, no renewal charge).</p>
          <form className="admRow" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); act({ action: "comp", plotId: Number(fd.get("plotId")), tier: String(fd.get("tier")), days: Number(fd.get("days")) }, "Plan comped"); e.currentTarget.reset(); }}>
            <input className="admInput" name="plotId" type="number" placeholder="booth #" required style={{ maxWidth: 110 }} />
            <select className="admInput" name="tier" defaultValue="pro">{d.data?.tiers.filter((t) => t.id !== "free").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <input className="admInput" name="days" type="number" defaultValue={30} min={1} style={{ maxWidth: 90 }} />
            <button className="admBtn admBtn--primary">Comp</button>
          </form>
        </div>
        <div className="admCard">
          <div className="admCard__hd"><h2 className="admH2">Recent renewal charges</h2></div>
          {!d.data?.renewals.length ? <Empty>No renewals yet.</Empty> : <div className="admTableWrap"><table className="admTable"><tbody>{d.data.renewals.map((t) => <tr key={t.id}><td><Link href={`/admin/transactions/${t.id}`}>#{t.plotId}</Link></td><td><Badge>{t.status}</Badge></td><td className="num"><Money cents={t.amountCents} /></td><td><DateTime value={t.createdAt} /></td><td className="admMuted" style={{ maxWidth: 220 }}>{t.notes}</td></tr>)}</tbody></table></div>}
        </div>
      </div>
    </>
  );
}
