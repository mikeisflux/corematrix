"use client";
import { useEffect, useRef } from "react";
import { Pager } from "../shared";
import { isDraft, isFailed, relTime, type MsgRow } from "./types";
const BADGE: Record<string, string> = { sent: "admBadge--info", delivered: "admBadge--ok", opened: "admBadge--ok", clicked: "admBadge--ok", queued: "admBadge--warn", draft: "admBadge--dim" };
export interface ListProps {
  rows: MsgRow[]; sel: string | null; cursor: number; checked: Set<string>; loading: boolean; error: string | null;
  page: number; pages: number; onPage: (p: number) => void; onOpen: (m: MsgRow) => void; onCheck: (id: string, shift: boolean) => void; onStar: (m: MsgRow) => void;
}
export default function MessageList(p: ListProps) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.querySelector<HTMLElement>(".admMailRow.cur")?.scrollIntoView({ block: "nearest" }); }, [p.cursor]);
  return (
    <div className="admMail__list">
      <div className="admMail__rows" ref={box} role="listbox" aria-label="Messages">
        {p.error && <div className="admNote admNote--err" style={{ margin: 10 }}>{p.error}</div>}
        {p.rows.map((m, i) => {
          const out = m.direction === "out";
          const draft = isDraft(m);
          const who = draft ? `Draft → ${m.toEmail || "(no recipient)"}` : out ? `→ ${m.toEmail}` : (m.fromName ? m.fromName : m.fromEmail);
          const unread = !out && !m.read;
          const cls = `admMailRow${p.sel === m.id ? " sel" : ""}${p.cursor === i ? " cur" : ""}${unread ? " unread" : ""}${p.checked.has(m.id) ? " chk" : ""}`;
          const status = out && !draft ? (m.status || "queued") : null;
          return (
            <div key={m.id} className={cls} role="option" aria-selected={p.sel === m.id} onClick={() => p.onOpen(m)}>
              <input type="checkbox" checked={p.checked.has(m.id)} onClick={(e) => { e.stopPropagation(); p.onCheck(m.id, e.shiftKey); }} onChange={() => {}} aria-label="Select" />
              <button type="button" className={`admStar${m.starred ? " on" : ""}`} title={m.starred ? "Unstar (s)" : "Star (s)"} onClick={(e) => { e.stopPropagation(); p.onStar(m); }}>★</button>
              <div style={{ minWidth: 0 }}>
                <div className="who" title={out ? m.toEmail || "" : m.fromEmail}>{who}</div>
                <div className="subj">{m.subject || <span className="admMuted">(no subject)</span>}</div>
                {m.snippet && <div className="snip">{m.snippet}</div>}
              </div>
              <div className="meta">
                <span title={new Date(m.createdAt).toLocaleString()}>{relTime(m.sentAt || m.createdAt)}</span>
                {m.attachmentCount > 0 && <span title={`${m.attachmentCount} attachment(s)`}>📎{m.attachmentCount}</span>}
                {draft && <span className="admBadge admBadge--dim">draft</span>}
                {status && <span className={`admBadge ${isFailed(status) ? "admBadge--bad" : BADGE[status] || "admBadge--dim"}`} title={m.statusMessage || status}>{status}</span>}
              </div>
            </div>
          );
        })}
        {p.rows.length === 0 && <div className="admEmpty" style={{ padding: 20 }}>{p.loading ? "Loading…" : "Nothing here."}</div>}
      </div>
      {p.pages > 1 && <div className="admMail__pager"><Pager page={p.page} pages={p.pages} onPage={p.onPage} /></div>}
    </div>
  );
}
