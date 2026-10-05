"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useJson, Badge, DateTime, ConfirmButton } from "./shared";
import { frameDoc } from "./sanitize";
import ThreadList from "./inbox/ThreadList";
import { forwardPrefill, isDraft, isFailed, kb, replyPrefill, type ComposePrefill, type FullMsg, type ThreadRow } from "./inbox/types";

export interface ReaderProps {
  id: string; onChange: () => void; onDelete: () => void; onSelect: (id: string) => void; onBack?: () => void;
  patch: (id: string, d: Record<string, boolean>) => Promise<void>; onCompose: (p: ComposePrefill) => void; onResend: (id: string) => Promise<void>;
}
function prepare(m: FullMsg, showImages: boolean): { doc: string; blocked: number } {
  if (!m.html) return { doc: "", blocked: 0 };
  let html = m.html;
  for (const a of m.attachments) if (a.contentId) html = html.split(`cid:${a.contentId}`).join(`/api/admin/emails/attachments/${a.id}?inline=1`);
  let doc = frameDoc(html);
  let blocked = 0;
  if (!showImages) {
    doc = doc.replace(/(<img\b[^>]*?)\s(src|srcset)\s*=/gi, (_m, a: string, b: string) => { blocked++; return `${a} data-${b}=`; });
    doc = doc.replace(/url\(\s*['"]?\s*(https?:)?\/\//gi, () => { blocked++; return "url(about:blank#"; });
  }
  return { doc, blocked };
}
export default function InboxReader(p: ReaderProps) {
  const { data, error, reload, setData } = useJson<{ row: FullMsg; thread: ThreadRow[]; me: string }>(`/api/admin/emails/${p.id}`);
  const [plain, setPlain] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [showHeaders, setShowHeaders] = useState(false);
  const [busy, setBusy] = useState(false);
  const m = data?.row;
  const { doc, blocked } = useMemo(() => (m ? prepare(m, showImages) : { doc: "", blocked: 0 }), [m, showImages]);
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (!m || m.direction !== "in" || m.read || marked.current === m.id) return;
    marked.current = m.id;
    setData((d) => (d ? { ...d, row: { ...d.row, read: true } } : d));
    p.patch(m.id, { read: true });
  }, [m, p, setData]);
  if (error) return <div className="admNote admNote--err" style={{ margin: 16 }}>{error}</div>;
  if (!m) return <div className="admEmpty" style={{ padding: 24 }}>Loading…</div>;
  const doPatch = async (d: Record<string, boolean>) => { await p.patch(m.id, d); reload(); p.onChange(); };
  const failed = isFailed(m.status);
  const out = m.direction === "out";
  const bcc = (m.headers as { bcc?: string } | null)?.bcc;
  return (
    <>
      <div className="admMail__hd">
        <div className="admRow admRow--between" style={{ alignItems: "flex-start" }}>
          <div className="admRow" style={{ minWidth: 0 }}>
            {p.onBack && <button type="button" className="admBtn admBtn--sm admMail__back" onClick={p.onBack}>← Back</button>}
            <h2 className="admMail__subject">{m.subject || "(no subject)"}</h2>
          </div>
          <div className="admRow"><Badge kind="dim">{m.channel}</Badge>{out && <Badge kind={isDraft(m) ? "dim" : undefined}>{m.status || "queued"}</Badge>}{!out && !m.read && <Badge kind="hot">unread</Badge>}</div>
        </div>
        <div className="admMail__kv">
          <b>From</b><span>{m.fromName ? `${m.fromName} <${m.fromEmail}>` : m.fromEmail}</span>
          {m.toEmail && <><b>To</b><span>{m.toEmail}</span></>}
          {m.cc && <><b>Cc</b><span>{m.cc}</span></>}
          {bcc && <><b>Bcc</b><span>{bcc}</span></>}
          <b>Date</b><span><DateTime value={m.sentAt || m.createdAt} />{m.templateSlug && <> · template <span className="admMono">{m.templateSlug}</span></>}</span>
          {out && <><b>Status</b><span style={failed ? { color: "var(--heat-6)" } : undefined}>{m.status || "queued"}{m.statusMessage ? ` — ${m.statusMessage}` : ""}</span></>}
        </div>
        <div className="admRow">
          {isDraft(m) ? (
            <button type="button" className="admBtn admBtn--sm admBtn--primary" onClick={() => p.onCompose({ draftId: m.id })}>Edit draft</button>
          ) : (<>
            <button type="button" className="admBtn admBtn--sm admBtn--primary" title="Reply (r)" onClick={() => p.onCompose(replyPrefill(m, false, data?.me || ""))}>Reply</button>
            <button type="button" className="admBtn admBtn--sm" onClick={() => p.onCompose(replyPrefill(m, true, data?.me || ""))}>Reply all</button>
            <button type="button" className="admBtn admBtn--sm" onClick={() => p.onCompose(forwardPrefill(m))}>Forward</button>
          </>)}
          {out && failed && <button type="button" className="admBtn admBtn--sm admBtn--danger" disabled={busy} onClick={async () => { setBusy(true); try { await p.onResend(m.id); } finally { setBusy(false); } }}>{busy ? "Resending…" : "Resend"}</button>}
          {!out && <button type="button" className="admBtn admBtn--sm" onClick={() => doPatch({ read: !m.read })}>{m.read ? "Mark unread" : "Mark read"}</button>}
          <button type="button" className={`admBtn admBtn--sm${m.starred ? " on" : ""}`} title="Star (s)" onClick={() => doPatch({ starred: !m.starred })}>{m.starred ? "Unstar" : "Star"}</button>
          <button type="button" className="admBtn admBtn--sm" title="Archive (e)" onClick={() => doPatch({ archived: !m.archived })}>{m.archived ? "Unarchive" : "Archive"}</button>
          <ConfirmButton className="admBtn admBtn--sm admBtn--danger" message="Delete this message and its attachments?" onConfirm={p.onDelete}>Delete</ConfirmButton>
          <span style={{ flex: 1 }} />
          {m.html && <button type="button" className={`admBtn admBtn--sm admBtn--ghost${showImages ? " on" : ""}`} onClick={() => setShowImages((v) => !v)}>{showImages ? "Hide images" : `Show images${blocked ? ` (${blocked})` : ""}`}</button>}
          {m.html && <button type="button" className={`admBtn admBtn--sm admBtn--ghost${plain ? " on" : ""}`} onClick={() => setPlain((v) => !v)}>{plain ? "Rich" : "Plain text"}</button>}
          {m.headers && <button type="button" className={`admBtn admBtn--sm admBtn--ghost${showHeaders ? " on" : ""}`} onClick={() => setShowHeaders((h) => !h)}>Headers</button>}
        </div>
        {showHeaders && m.headers && <pre className="admPre" style={{ maxHeight: 200 }}>{Object.entries(m.headers).filter(([, v]) => v).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join("\n")}</pre>}
      </div>
      <div className="admMail__body">
        {m.html && !plain ? <iframe title="message" sandbox="" srcDoc={doc} /> : <div className="txt">{m.text || "(no text)"}</div>}
        {m.attachments.length > 0 && <div className="admMail__attach">{m.attachments.map((a) => <a key={a.id} className="admBtn admBtn--sm" href={`/api/admin/emails/attachments/${a.id}`} download={a.filename}>{a.inline ? "🖼" : "📎"} {a.filename} <span className="admMuted">{kb(a.size)}</span></a>)}</div>}
        {out && m.events && m.events.length > 0 && (
          <div className="admMail__events"><div className="admLabel">Delivery events</div><div className="admTimeline">
            {m.events.map((ev, i) => <div key={i}><b>{ev.event}</b>{(ev.at || ev.timestamp) ? <span className="admMuted"> · {new Date(ev.at ?? (typeof ev.timestamp === "number" ? ev.timestamp * 1000 : String(ev.timestamp))).toLocaleString()}</span> : null}{ev.reason ? <div className="admMuted">{ev.reason}</div> : null}</div>)}
          </div></div>
        )}
        {data && <ThreadList rows={data.thread} onSelect={p.onSelect} />}
      </div>
    </>
  );
}
