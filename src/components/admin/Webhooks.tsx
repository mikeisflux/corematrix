"use client";
import { Fragment, useState } from "react";
import { useJson, api, useToast, Pager, PageHead, Badge, DateTime, Select, SearchBox, qs, Empty } from "./shared";
interface Ev { id: string; provider: string; eventId: string; type: string; status: string; error: string | null; receivedAt: number; processedAt: number | null; payload: unknown }
interface Resp { rows: Ev[]; total: number; pages: number; urls: { divinitycoin: string; sendgridEvents: string; sendgridInbound: string } }
export default function Webhooks({ initialStatus = "" }: { initialStatus?: string }) {
  const [provider, setProvider] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const list = useJson<Resp>(`/api/admin/webhooks?${qs({ provider, status, q, page })}`);
  const toast = useToast();
  async function reprocess(id: string) { try { const r = await api<{ result: { status: string; note?: string } }>(`/api/admin/webhooks/${id}/reprocess`, { method: "POST" }); toast.ok(`Reprocessed: ${r.result.status}${r.result.note ? ` — ${r.result.note}` : ""}`); list.reload(); } catch (e) { toast.err(e); } }
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.ok("Copied"));
  return (
    <>
      {toast.node}
      <PageHead title="Webhooks" sub="Every delivery from DivinityCoin and SendGrid, with its payload and outcome. Failed DivinityCoin events can be re-run after fixing the cause."><button className="admBtn" onClick={() => list.reload()}>Refresh</button></PageHead>
      {list.data && (
        <div className="admCard">
          <div className="admCard__hd"><h2 className="admH2">Endpoints to register</h2></div>
          <dl className="admKv">
            <dt>DivinityCoin</dt><dd className="admRow"><span className="admMono">{list.data.urls.divinitycoin}</span><button className="admBtn admBtn--sm" onClick={() => copy(list.data!.urls.divinitycoin)}>Copy</button></dd>
            <dt>SendGrid events</dt><dd className="admRow"><span className="admMono">{list.data.urls.sendgridEvents}</span><button className="admBtn admBtn--sm" onClick={() => copy(list.data!.urls.sendgridEvents)}>Copy</button></dd>
            <dt>SendGrid inbound</dt><dd className="admRow"><span className="admMono">{list.data.urls.sendgridInbound}</span><button className="admBtn admBtn--sm" onClick={() => copy(list.data!.urls.sendgridInbound)}>Copy</button></dd>
          </dl>
          <p className="admHint">Paste the DivinityCoin URL into its partner settings and set the signing secret in Settings → DivinityCoin. The SendGrid URLs need the key values from Settings → SendGrid in place of the placeholders.</p>
        </div>
      )}
      <div className="admCard">
        <div className="admFilters">
          <Select value={provider} onChange={(e) => { setProvider(e.target.value); setPage(1); }} options={[{ value: "", label: "All providers" }, "divinitycoin", "sendgrid"]} />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={[{ value: "", label: "All statuses" }, "received", "processed", "ignored", "failed"]} />
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Event id, type, error…" />
        </div>
        {list.error && <div className="admNote admNote--err">{list.error}</div>}
        <div className="admTableWrap"><table className="admTable">
          <thead><tr><th>Received</th><th>Provider</th><th>Type</th><th>Status</th><th>Note / error</th><th></th></tr></thead>
          <tbody>{list.data?.rows.map((e) => (
            <Fragment key={e.id}>
              <tr><td><DateTime value={e.receivedAt} /></td><td className="admMono">{e.provider}</td><td className="admMono">{e.type}<div className="admMuted" style={{ fontSize: 11 }}>{e.eventId.slice(0, 40)}</div></td><td><Badge>{e.status}</Badge></td><td style={{ maxWidth: 360, wordBreak: "break-word" }}>{e.error || <span className="admMuted">—</span>}</td>
                <td style={{ whiteSpace: "nowrap" }}><button className="admBtn admBtn--sm" onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? "Hide" : "Payload"}</button>{" "}{e.provider === "divinitycoin" && <button className="admBtn admBtn--sm" onClick={() => reprocess(e.id)}>Reprocess</button>}</td></tr>
              {open === e.id && <tr className="admEditRow"><td colSpan={6}><pre className="admPre">{JSON.stringify(e.payload, null, 2)}</pre></td></tr>}
            </Fragment>
          ))}</tbody>
        </table></div>
        {list.data && list.data.rows.length === 0 && <Empty>{list.loading ? "Loading…" : "No webhook deliveries yet."}</Empty>}
        {list.data && <Pager page={page} pages={list.data.pages} total={list.data.total} onPage={setPage} />}
      </div>
    </>
  );
}
