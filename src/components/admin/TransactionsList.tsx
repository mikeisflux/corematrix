"use client";
import Link from "next/link";
import { useState } from "react";
import { useJson, Pager, PageHead, Badge, Money, DateTime, Select, SearchBox, qs, Empty } from "./shared";
interface Row { id: string; plotId: number; kind: string; status: string; provider: string; amountCents: number; refundedCents: number; sellerPayoutCents: number; createdAt: number; paidAt: number | null; providerRef: string | null; buyerEmail: string | null }
export default function TransactionsList({ initialStatus = "" }: { initialStatus?: string }) {
  const [status, setStatus] = useState(initialStatus); const [kind, setKind] = useState(""); const [provider, setProvider] = useState(""); const [q, setQ] = useState(""); const [page, setPage] = useState(1);
  const list = useJson<{ rows: Row[]; total: number; pages: number; paidSumCents: number }>(`/api/admin/transactions?${qs({ status, kind, provider, q, page })}`);
  const reset = () => setPage(1);
  return (
    <>
      <PageHead title="Transactions" sub="Every checkout: claims, takeovers, boosts, plan charges, coin packs and billboards. Refund or inspect a payment from its detail page.">
        <a className="admBtn" href={`/api/admin/transactions?${qs({ status, kind, provider, q, export: "csv" })}`}>Export CSV</a>
      </PageHead>
      <div className="admCard">
        <div className="admFilters">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); reset(); }} options={[{ value: "", label: "All statuses" }, "pending", "paid", "failed", "refunded", "disputed"]} />
          <Select value={kind} onChange={(e) => { setKind(e.target.value); reset(); }} options={[{ value: "", label: "All kinds" }, "claim", "takeover", "boost", "tier", "coins", "billboard"]} />
          <Select value={provider} onChange={(e) => { setProvider(e.target.value); reset(); }} options={[{ value: "", label: "All providers" }, "divinitycoin", "comp", "sandbox"]} />
          <SearchBox value={q} onChange={(v) => { setQ(v); reset(); }} placeholder="Tx id, booth #, email, pi_…" />
          {list.data && <span className="admLabel">paid total <Money cents={list.data.paidSumCents} /></span>}
        </div>
        {list.error && <div className="admNote admNote--err">{list.error}</div>}
        <div className="admTableWrap"><table className="admTable">
          <thead><tr><th>When</th><th>Kind</th><th>Booth</th><th>Buyer</th><th>Status</th><th>Provider</th><th>Amount</th><th>Refunded</th><th></th></tr></thead>
          <tbody>{list.data?.rows.map((t) => (
            <tr key={t.id}><td><DateTime value={t.createdAt} /></td><td>{t.kind}</td><td className="admMono"><Link href={`/admin/booths/${t.plotId}`}>#{t.plotId}</Link></td><td className="admMono">{t.buyerEmail || "—"}</td><td><Badge>{t.status}</Badge></td><td className="admMono">{t.provider}</td><td className="num"><Money cents={t.amountCents} /></td><td className="num">{t.refundedCents ? <Money cents={t.refundedCents} /> : <span className="admMuted">—</span>}</td><td><Link className="admBtn admBtn--sm" href={`/admin/transactions/${t.id}`}>Open</Link></td></tr>
          ))}</tbody>
        </table></div>
        {list.data && list.data.rows.length === 0 && <Empty>{list.loading ? "Loading…" : "No transactions match."}</Empty>}
        {list.data && <Pager page={page} pages={list.data.pages} total={list.data.total} onPage={setPage} />}
      </div>
    </>
  );
}
