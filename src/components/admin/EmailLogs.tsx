"use client";
import { useState } from "react";
import { useJson, api, useToast, Pager, PageHead, Badge, DateTime, Select, SearchBox, ConfirmButton, qs, Empty } from "./shared";
import type { MsgRow } from "./Inbox";
interface Detail { row: MsgRow & { text: string | null; html: string | null; events: Array<{ event: string; at?: string; reason?: string; url?: string }> | null; cc: string | null; attachments: { id: string; filename: string; size: number }[] } }
const STATUSES = ["", "queued", "sent", "delivered", "opened", "clicked", "bounced", "failed", "spam"];
export default function EmailLogs() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<string | null>(null);
  const list = useJson<{ rows: MsgRow[]; total: number; pages: number }>(`/api/admin/emails?${qs({ folder: "sent", status, q, page })}`);
  const detail = useJson<Detail>(sel ? `/api/admin/emails/${sel}` : null);
  const toast = useToast();
  async function resend(id: string) { try { await api(`/api/admin/emails/${id}`, { method: "POST", json: { action: "resend" } }); toast.ok("Queued a new send"); list.reload(); } catch (e) { toast.err(e); } }
  return (
    <>
      {toast.node}
      <PageHead title="Email logs" sub="Every outbound message with its SendGrid delivery status. Open, click and bounce events arrive through the SendGrid Event Webhook.">
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={STATUSES.map((s) => ({ value: s, label: s || "All statuses" }))} />
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Recipient, subject…" />
      </PageHead>
      {list.error && <div className="admNote admNote--err">{list.error}</div>}
      <div className="admSplit">
        <div className="admCard">
          <div className="admTableWrap"><table className="admTable">
            <thead><tr><th>Sent</th><th>To</th><th>Subject</th><th>Template</th><th>Status</th><th></th></tr></thead>
            <tbody>{list.data?.rows.map((m) => (
              <tr key={m.id} className={sel === m.id ? "admEditRow" : ""} style={{ cursor: "pointer" }} onClick={() => setSel(m.id)}>
                <td><DateTime value={m.sentAt || m.createdAt} /></td>
                <td className="admMono" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{m.toEmail}</td>
                <td style={{ maxWidth: 260 }}>{m.subject}</td>
                <td className="admMono">{m.templateSlug || <span className="admMuted">—</span>}</td>
                <td><Badge>{m.status || "queued"}</Badge></td>
                <td>{["failed", "bounced"].includes(m.status || "") && <ConfirmButton className="admBtn admBtn--sm" message="Resend this message?" onConfirm={() => resend(m.id)}>Resend</ConfirmButton>}</td>
              </tr>
            ))}</tbody>
          </table></div>
          {list.data && list.data.rows.length === 0 && <Empty>{list.loading ? "Loading…" : "No outbound email yet."}</Empty>}
          {list.data && <Pager page={page} pages={list.data.pages} total={list.data.total} onPage={setPage} />}
        </div>
        <div className="admCard">
          {!sel && <Empty>Select a message to see its content and delivery timeline.</Empty>}
          {sel && detail.data && (
            <div className="admStack">
              <div className="admCard__hd"><h2 className="admH2">{detail.data.row.subject}</h2><Badge>{detail.data.row.status || "queued"}</Badge></div>
              <dl className="admKv">
                <dt>To</dt><dd className="admMono">{detail.data.row.toEmail}</dd>
                {detail.data.row.cc && <><dt>Cc</dt><dd className="admMono">{detail.data.row.cc}</dd></>}
                <dt>From</dt><dd className="admMono">{detail.data.row.fromName} &lt;{detail.data.row.fromEmail}&gt;</dd>
                <dt>Sent</dt><dd><DateTime value={detail.data.row.sentAt || detail.data.row.createdAt} /></dd>
                {detail.data.row.templateSlug && <><dt>Template</dt><dd className="admMono">{detail.data.row.templateSlug}</dd></>}
                {detail.data.row.statusMessage && <><dt>Message</dt><dd style={{ color: "var(--heat-6)" }}>{detail.data.row.statusMessage}</dd></>}
                {detail.data.row.attachments.length > 0 && <><dt>Attachments</dt><dd>{detail.data.row.attachments.map((a) => <a key={a.id} className="admBadge" href={`/api/admin/emails/attachments/${a.id}`} style={{ marginRight: 6 }}>{a.filename}</a>)}</dd></>}
              </dl>
              <div>
                <div className="admLabel" style={{ marginBottom: 6 }}>Delivery events</div>
                {detail.data.row.events?.length ? <div className="admTimeline">{detail.data.row.events.map((ev, i) => <div key={i}><b>{ev.event}</b>{ev.at ? <span className="admMuted"> · {new Date(ev.at).toLocaleString()}</span> : null}{ev.reason ? <div className="admMuted">{ev.reason}</div> : null}{ev.url ? <div className="admMuted admMono">{ev.url}</div> : null}</div>)}</div> : <div className="admMuted">No events yet (configure the SendGrid Event Webhook to receive them).</div>}
              </div>
              <div>
                <div className="admLabel" style={{ marginBottom: 6 }}>Content</div>
                {detail.data.row.html ? <iframe title="preview" className="admPreview" sandbox="" srcDoc={`<base target="_blank"><style>body{margin:0;padding:12px;font-family:sans-serif;background:#fff;color:#111}</style>${detail.data.row.html}`} style={{ width: "100%", height: 420, border: "1px solid var(--rule)", background: "#fff" }} /> : <pre className="admPre">{detail.data.row.text}</pre>}
              </div>
              <div className="admRow"><ConfirmButton className="admBtn" message="Send this message again to the same recipient?" onConfirm={() => resend(sel)}>Resend</ConfirmButton><a className="admBtn" href={`/admin/emails?folder=sent&id=${sel}`}>Open in inbox</a></div>
            </div>
          )}
          {sel && detail.error && <div className="admNote admNote--err">{detail.error}</div>}
        </div>
      </div>
    </>
  );
}
