"use client";
import { Fragment, useState } from "react";
import { useJson, Pager, PageHead, DateTime, Select, SearchBox, qs, Empty } from "./shared";
interface Row { id: string; adminEmail: string | null; action: string; resource: string; resourceId: string | null; before: unknown; after: unknown; ip: string | null; createdAt: number }
export default function AuditLog() {
  const [q, setQ] = useState(""); const [resource, setResource] = useState(""); const [page, setPage] = useState(1); const [open, setOpen] = useState<string | null>(null);
  const d = useJson<{ rows: Row[]; total: number; pages: number; resources: string[] }>(`/api/admin/audit?${qs({ q, resource, page })}`);
  return (
    <>
      <PageHead title="Audit log" sub="Every admin action with who did it, from where, and the before/after values." />
      <div className="admCard">
        <div className="admFilters">
          <Select value={resource} onChange={(e) => { setResource(e.target.value); setPage(1); }} options={[{ value: "", label: "All resources" }, ...(d.data?.resources ?? [])]} />
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Action, admin, id, value…" />
        </div>
        {d.error && <div className="admNote admNote--err">{d.error}</div>}
        <div className="admTableWrap"><table className="admTable">
          <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Resource</th><th>IP</th><th></th></tr></thead>
          <tbody>{d.data?.rows.map((r) => (
            <Fragment key={r.id}>
              <tr><td><DateTime value={r.createdAt} /></td><td className="admMono">{r.adminEmail || "—"}</td><td className="admMono">{r.action}</td><td className="admMono">{r.resource}{r.resourceId ? ` ${r.resourceId}` : ""}</td><td className="admMono admMuted">{r.ip}</td><td>{(r.before || r.after) ? <button className="admBtn admBtn--sm" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide" : "Diff"}</button> : null}</td></tr>
              {open === r.id && <tr className="admEditRow"><td colSpan={6}><div className="admSplit"><div><div className="admLabel">Before</div><pre className="admPre">{JSON.stringify(r.before, null, 2) ?? "—"}</pre></div><div><div className="admLabel">After</div><pre className="admPre">{JSON.stringify(r.after, null, 2) ?? "—"}</pre></div></div></td></tr>}
            </Fragment>
          ))}</tbody>
        </table></div>
        {d.data && d.data.rows.length === 0 && <Empty>No admin actions logged yet.</Empty>}
        {d.data && <Pager page={page} pages={d.data.pages} total={d.data.total} onPage={setPage} />}
      </div>
    </>
  );
}
