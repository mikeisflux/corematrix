"use client";
import { Fragment, useState } from "react";
import { useJson, api, useToast, Pager, PageHead, Badge, DateTime, Select, SearchBox, qs, Empty, ConfirmButton } from "./shared";
interface Row { id: string; kind: string; where: string; message: string; stack: string | null; url: string | null; ua: string | null; visitorId: string | null; userId: string | null; count: number; firstAt: number; lastAt: number; resolvedAt: number | null }
interface Resp { rows: Row[]; total: number; pages: number; open24h: number }
/** "Edge 130 · Windows" from a user-agent string; Edge and Opera carry a Chrome token too, so they are checked first. */
const browser = (ua: string | null) => {
  if (!ua) return "?";
  const m = /Edg\/([\d.]+)/.exec(ua) ? ["Edge", /Edg\/([\d.]+)/.exec(ua)![1]] : /OPR\/([\d.]+)/.exec(ua) ? ["Opera", /OPR\/([\d.]+)/.exec(ua)![1]] : /Firefox\/([\d.]+)/.exec(ua) ? ["Firefox", /Firefox\/([\d.]+)/.exec(ua)![1]] : /Chrome\/([\d.]+)/.exec(ua) ? ["Chrome", /Chrome\/([\d.]+)/.exec(ua)![1]] : /Version\/([\d.]+).*Safari/.exec(ua) ? ["Safari", /Version\/([\d.]+)/.exec(ua)![1]] : null;
  const os = /iPhone|iPad|Android|Windows|Mac OS X|CrOS|Linux/.exec(ua)?.[0] ?? "";
  return `${m ? `${m[0]} ${m[1].split(".")[0]}` : ua.slice(0, 20)}${os ? ` · ${os}` : ""}`;
};
export default function Sentinel() {
  const [status, setStatus] = useState("open"); const [kind, setKind] = useState(""); const [q, setQ] = useState(""); const [page, setPage] = useState(1); const [open, setOpen] = useState<string | null>(null);
  const list = useJson<Resp>(`/api/admin/errors?${qs({ status, kind, q, page })}`);
  const toast = useToast();
  const resolve = async (id: string, resolved: boolean) => { try { await api("/api/admin/errors", { method: "PATCH", json: { id, resolved } }); list.reload(); } catch (e) { toast.err(e); } };
  return (
    <>
      {toast.node}
      <PageHead title="Sentinel" sub="Every error the hall throws in a browser (white screens, uncaught errors) and every error a server route throws. Repeats within an hour fold into one row with a count.">
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Message, route, URL, browser…" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={[{ value: "open", label: "Open" }, { value: "resolved", label: "Resolved" }, { value: "all", label: "All" }]} />
        <Select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} options={[{ value: "", label: "Browser + server" }, { value: "client", label: "Browser" }, { value: "server", label: "Server" }]} />
        <ConfirmButton className="admBtn" message="Delete every resolved error?" onConfirm={async () => { await api("/api/admin/errors?scope=resolved", { method: "DELETE" }); list.reload(); }}>Clear resolved</ConfirmButton>
      </PageHead>
      <div className="admGrid">
        <div className="admTile" style={{ ["--c" as string]: list.data?.open24h ? "var(--heat-7)" : undefined }}><div className="admLabel">Open, last 24 h</div><div className="admTile__n">{list.data?.open24h ?? "–"}</div><div className="admTile__sub">occurrences, browser + server</div></div>
        <div className="admTile"><div className="admLabel">Rows</div><div className="admTile__n">{list.data?.total ?? "–"}</div><div className="admTile__sub">{status} · {kind || "both"}</div></div>
      </div>
      <div className="admCard">
        {list.error ? <div className="admNote admNote--err">{list.error}</div> : !list.data ? <Empty>Loading…</Empty> : list.data.rows.length === 0 ? <Empty>Nothing here. The hall reports render errors, uncaught errors and rejected promises; the server reports route errors.</Empty> : (
          <div className="admTableWrap"><table className="admTable"><thead><tr><th>Last seen</th><th>Kind</th><th>Where</th><th>Message</th><th className="num">Count</th><th>Browser</th><th></th></tr></thead><tbody>
            {list.data.rows.map((r) => (
              <Fragment key={r.id}>
                <tr onClick={() => setOpen(open === r.id ? null : r.id)} style={{ cursor: "pointer" }}>
                  <td><DateTime value={r.lastAt} /></td>
                  <td><Badge kind={r.kind === "server" ? "hot" : undefined}>{r.kind}</Badge></td>
                  <td className="admMono">{r.where}</td>
                  <td style={{ maxWidth: 480 }}>{r.message.slice(0, 160)}{r.url && <div className="admMuted admMono">{r.url.slice(0, 80)}</div>}</td>
                  <td className="num">{r.count}</td>
                  <td>{browser(r.ua)}</td>
                  <td onClick={(e) => e.stopPropagation()}>{r.resolvedAt ? <button className="admBtn admBtn--sm" onClick={() => resolve(r.id, false)}>Reopen</button> : <button className="admBtn admBtn--sm admBtn--primary" onClick={() => resolve(r.id, true)}>Resolve</button>}</td>
                </tr>
                {open === r.id && (
                  <tr><td colSpan={7}>
                    <div className="admMuted" style={{ marginBottom: 6 }}>first seen <DateTime value={r.firstAt} /> · visitor <span className="admMono">{r.visitorId ?? "?"}</span>{r.userId && <> · user <a href={`/admin/users/${r.userId}`}>{r.userId}</a></>}{r.ua && <div className="admMono" style={{ fontSize: 11 }}>{r.ua}</div>}</div>
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, maxHeight: 360, overflow: "auto", margin: 0 }}>{r.stack || r.message}</pre>
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody></table></div>
        )}
        {list.data && <Pager page={page} pages={list.data.pages} total={list.data.total} onPage={setPage} />}
      </div>
    </>
  );
}
