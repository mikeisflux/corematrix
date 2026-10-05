"use client";
import Link from "next/link";
import { useState } from "react";
import { useJson, Pager, PageHead, Badge, Money, DateTime, Select, SearchBox, qs, Empty } from "./shared";
interface Row { id: number; name: string | null; website: string | null; tier: string; subscriptionStatus: string | null; district: string; floors: number; valueCents: number; claimedAt: number | null; hidden: boolean; notForSaleUntil: number | null; totalViews: number; totalClicks: number; salesCount: number; ownerEmail: string | null }
export default function BoothsList() {
  const [q, setQ] = useState(""); const [tier, setTier] = useState(""); const [state, setState] = useState("claimed"); const [sort, setSort] = useState("value"); const [page, setPage] = useState(1);
  const list = useJson<{ rows: Row[]; total: number; pages: number }>(`/api/admin/booths?${qs({ q, tier, state, sort, page })}`);
  return (
    <>
      <PageHead title="Booths" sub="Claimed booth spaces in the hall. Open one to edit its listing, hide it, shield it from takeovers, transfer or release it." />
      <div className="admCard">
        <div className="admFilters">
          <Select value={state} onChange={(e) => { setState(e.target.value); setPage(1); }} options={[{ value: "claimed", label: "Claimed" }, { value: "hidden", label: "Hidden" }, { value: "shielded", label: "Shielded" }]} />
          <Select value={tier} onChange={(e) => { setTier(e.target.value); setPage(1); }} options={[{ value: "", label: "All plans" }, "free", "pro", "landmark"]} />
          <Select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} options={[{ value: "value", label: "By value" }, { value: "views", label: "By views" }, { value: "clicks", label: "By clicks" }, { value: "recent", label: "Recently claimed" }, { value: "id", label: "By number" }]} />
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name, website, owner email, #" />
        </div>
        {list.error && <div className="admNote admNote--err">{list.error}</div>}
        <div className="admTableWrap"><table className="admTable">
          <thead><tr><th>#</th><th>Name</th><th>Owner</th><th>Plan</th><th>Value</th><th>Views</th><th>Clicks</th><th>Sales</th><th>Claimed</th><th></th></tr></thead>
          <tbody>{list.data?.rows.map((p) => (
            <tr key={p.id}><td className="admMono">#{p.id}</td><td>{p.name || <span className="admMuted">unnamed</span>} {p.hidden && <Badge kind="dim">hidden</Badge>} {p.notForSaleUntil && p.notForSaleUntil > Date.now() && <Badge kind="ok">shield</Badge>}<div className="admMuted">{p.website}</div></td><td className="admMono">{p.ownerEmail || "—"}</td><td><Badge>{p.tier}</Badge></td><td className="num"><Money cents={p.valueCents} /></td><td className="num">{p.totalViews.toLocaleString()}</td><td className="num">{p.totalClicks.toLocaleString()}</td><td className="num">{p.salesCount}</td><td><DateTime value={p.claimedAt} dateOnly /></td><td><Link className="admBtn admBtn--sm" href={`/admin/booths/${p.id}`}>Open</Link></td></tr>
          ))}</tbody>
        </table></div>
        {list.data && list.data.rows.length === 0 && <Empty>{list.loading ? "Loading…" : "No booths match."}</Empty>}
        {list.data && <Pager page={page} pages={list.data.pages} total={list.data.total} onPage={setPage} />}
      </div>
    </>
  );
}
