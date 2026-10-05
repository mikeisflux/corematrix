"use client";
import Link from "next/link";
import { useState } from "react";
import { useJson, api, useToast, PageHead, Badge, Money, DateTime, ConfirmButton, Field, Input, Textarea } from "./shared";
interface Resp { tx: { id: string; plotId: number; kind: string; status: string; provider: string; providerRef: string | null; sessionId: string | null; amountCents: number; refundedCents: number; sellerPayoutCents: number; platformCents: number; valueBefore: number; valueAfter: number; customerIp: string | null; customerUserAgent: string | null; notes: string | null; meta: unknown; createdAt: number; paidAt: number | null }; description: string; buyer: { id: string; email: string } | null; seller: { id: string; email: string } | null; plot: { id: number; name: string | null; ownerId: string | null; tier: string; valueCents: number } | null; webhooks: { id: string; type: string; status: string; receivedAt: number; error: string | null }[]; mail: { id: string; subject: string; status: string | null; toEmail: string | null; createdAt: number }[] }
export default function TransactionDetail({ id }: { id: string }) {
  const d = useJson<Resp>(`/api/admin/transactions/${id}`);
  const [refund, setRefund] = useState({ amount: "", reason: "" });
  const [note, setNote] = useState<string | null>(null);
  const toast = useToast();
  const act = async (json: Record<string, unknown>, msg: string) => { try { await api(`/api/admin/transactions/${id}`, { method: "POST", json }); toast.ok(msg); d.reload(); } catch (e) { toast.err(e); } };
  if (d.error) return <div className="admNote admNote--err">{d.error}</div>;
  if (!d.data) return <div className="admMuted">Loading…</div>;
  const { tx, buyer, seller, plot } = d.data;
  const left = tx.amountCents - tx.refundedCents;
  return (
    <>
      {toast.node}
      <PageHead title={d.data.description} sub={`Transaction ${tx.id}`}>
        <Badge kind={tx.status === "paid" ? "ok" : tx.status === "pending" ? "dim" : "bad"}>{tx.status}</Badge>
        {tx.status === "paid" && buyer && <button className="admBtn" onClick={() => act({ action: "resend_receipt" }, "Receipt resent")}>Resend receipt</button>}
        {tx.status === "pending" && <ConfirmButton className="admBtn" message="Mark this as paid without a payment (comp)? The claim/plan/coins are applied immediately." onConfirm={() => act({ action: "mark_paid", reason: "comp" }, "Marked paid")}>Mark paid (comp)</ConfirmButton>}
        {tx.status === "pending" && <ConfirmButton className="admBtn admBtn--danger" message="Cancel this pending checkout?" onConfirm={() => act({ action: "mark_failed", reason: "canceled by admin" }, "Canceled")}>Cancel</ConfirmButton>}
      </PageHead>
      <div className="admSplit">
        <div className="admCard">
          <div className="admCard__hd"><h2 className="admH2">Payment</h2></div>
          <dl className="admKv">
            <dt>Amount</dt><dd><Money cents={tx.amountCents} />{tx.refundedCents > 0 && <span className="admMuted"> · refunded <Money cents={tx.refundedCents} /></span>}</dd>
            <dt>Split</dt><dd>seller <Money cents={tx.sellerPayoutCents} /> · platform <Money cents={tx.platformCents} /></dd>
            <dt>Value</dt><dd><Money cents={tx.valueBefore} /> → <Money cents={tx.valueAfter} /></dd>
            <dt>Provider</dt><dd className="admMono">{tx.provider}{tx.providerRef && <> · {tx.providerRef}</>}{tx.sessionId && <div className="admMuted">session {tx.sessionId}</div>}</dd>
            <dt>Created</dt><dd><DateTime value={tx.createdAt} /></dd>
            <dt>Paid</dt><dd><DateTime value={tx.paidAt} /></dd>
            <dt>Customer</dt><dd className="admMono">{tx.customerIp || "—"}<div className="admMuted" style={{ fontSize: 11 }}>{tx.customerUserAgent}</div></dd>
            <dt>Buyer</dt><dd>{buyer ? <Link href={`/admin/users/${buyer.id}`}>{buyer.email}</Link> : "—"}</dd>
            {seller && <><dt>Seller</dt><dd><Link href={`/admin/users/${seller.id}`}>{seller.email}</Link></dd></>}
            <dt>Booth</dt><dd>{plot ? <Link href={`/admin/booths/${plot.id}`}>#{plot.id} {plot.name}</Link> : `#${tx.plotId}`}</dd>
          </dl>
          {tx.meta ? <><div className="admLabel" style={{ marginTop: 10 }}>Meta</div><pre className="admPre" style={{ maxHeight: 220 }}>{JSON.stringify(tx.meta, null, 2)}</pre></> : null}
        </div>
        <div className="admStack">
          {tx.status === "paid" && left > 0 && (
            <div className="admCard">
              <div className="admCard__hd"><h2 className="admH2">Refund</h2></div>
              <p className="admHint">Refunds go back through DivinityCoin to the original card. A full refund of a claim releases the booth.</p>
              <form className="admForm" onSubmit={(e) => { e.preventDefault(); }}>
                <Field label={`Amount in cents (blank = full ${left})`}><Input type="number" min={1} max={left} value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} placeholder={String(left)} /></Field>
                <Field label="Reason"><Input value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} placeholder="customer request" /></Field>
                <div className="span2"><ConfirmButton className="admBtn admBtn--danger" message={`Refund ${refund.amount ? `${refund.amount}¢` : "the full amount"}? This cannot be undone.`} onConfirm={() => act({ action: "refund", amountCents: refund.amount || undefined, reason: refund.reason }, "Refunded")}>Refund</ConfirmButton></div>
              </form>
            </div>
          )}
          <div className="admCard">
            <div className="admCard__hd"><h2 className="admH2">Notes</h2></div>
            <Textarea value={note ?? tx.notes ?? ""} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 120 }} />
            <div className="admRow" style={{ marginTop: 8 }}><button className="admBtn admBtn--primary" disabled={note === null} onClick={() => act({ action: "note", note }, "Note saved").then(() => setNote(null))}>Save note</button></div>
          </div>
          <div className="admCard">
            <div className="admCard__hd"><h2 className="admH2">Related</h2></div>
            <div className="admLabel">Webhooks</div>
            {d.data.webhooks.length === 0 ? <div className="admMuted">None mention this transaction.</div> : <div className="admTimeline">{d.data.webhooks.map((w) => <div key={w.id}><b>{w.type}</b> <Badge>{w.status}</Badge> <span className="admMuted"><DateTime value={w.receivedAt} /></span>{w.error && <div className="admMuted">{w.error}</div>}</div>)}</div>}
            <div className="admLabel" style={{ marginTop: 10 }}>Email</div>
            {d.data.mail.length === 0 ? <div className="admMuted">No email tied to this transaction.</div> : <div className="admTimeline">{d.data.mail.map((m) => <div key={m.id}><Link href={`/admin/emails?folder=all&id=${m.id}`}>{m.subject}</Link> <Badge>{m.status || "queued"}</Badge> <span className="admMuted">{m.toEmail}</span></div>)}</div>}
          </div>
        </div>
      </div>
    </>
  );
}
