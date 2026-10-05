"use client";
import Link from "next/link";
import { useState } from "react";
import { useJson, Pager, PageHead, Badge, Money, DateTime, SearchBox, qs, Empty } from "./shared";
interface Row { id: string; email: string; displayName: string | null; handle: string | null; creditCents: number; coins: number; isAdmin: boolean; createdAt: number; lastSeenAt: number | null; booths: number; spentCents: number }
export default function UsersList() {
  const [q, setQ] = useState(""); const [page, setPage] = useState(1);
  const list = useJson<{ rows: Row[]; total: number; pages: number }>(`/api/admin/users?${qs({ q, page })}`);
  return (
    <>
      <PageHead title="Users" sub="Every account (email + password). Credit is spendable at checkout; coins are the arcade currency.">
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Email, name, handle…" />
        <a className="admBtn" href={`/api/admin/users?${qs({ q, export: "csv" })}`}>Export CSV</a>
      </PageHead>
      {list.error && <div className="admNote admNote--err">{list.error}</div>}
      <div className="admCard">
        <div className="admTableWrap"><table className="admTable">
          <thead><tr><th>User</th><th>Booths</th><th>Spent</th><th>Credit</th><th>Coins</th><th>Joined</th><th>Last seen</th><th></th></tr></thead>
          <tbody>{list.data?.rows.map((u) => (
            <tr key={u.id}><td><Link href={`/admin/users/${u.id}`}>{u.email}</Link>{u.isAdmin && <> <Badge kind="hot">admin</Badge></>}<div className="admMuted">{[u.displayName, u.handle && `@${u.handle}`].filter(Boolean).join(" · ")}</div></td>
              <td className="num">{u.booths}</td><td className="num"><Money cents={u.spentCents} /></td><td className="num"><Money cents={u.creditCents} /></td><td className="num">{u.coins}</td><td><DateTime value={u.createdAt} dateOnly /></td><td><DateTime value={u.lastSeenAt} /></td><td><Link className="admBtn admBtn--sm" href={`/admin/users/${u.id}`}>Open</Link></td></tr>
          ))}</tbody>
        </table></div>
        {list.data && list.data.rows.length === 0 && <Empty>{list.loading ? "Loading…" : "No users match."}</Empty>}
        {list.data && <Pager page={page} pages={list.data.pages} total={list.data.total} onPage={setPage} />}
      </div>
    </>
  );
}
