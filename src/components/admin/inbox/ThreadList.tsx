"use client";
import { useState } from "react";
import { api } from "../shared";
import { relTime, type FullMsg, type ThreadRow } from "./types";
export default function ThreadList({ rows, onSelect }: { rows: ThreadRow[]; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState<Record<string, FullMsg | "loading" | undefined>>({});
  if (!rows.length) return null;
  const toggle = async (id: string) => {
    if (open[id]) { setOpen((o) => ({ ...o, [id]: undefined })); return; }
    setOpen((o) => ({ ...o, [id]: "loading" }));
    try { const d = await api<{ row: FullMsg }>(`/api/admin/emails/${id}`); setOpen((o) => ({ ...o, [id]: d.row })); }
    catch { setOpen((o) => ({ ...o, [id]: undefined })); }
  };
  return (
    <div className="admMailThread">
      <div className="admLabel" style={{ padding: "10px 16px 4px" }}>Thread · {rows.length + 1} messages</div>
      {rows.map((t) => {
        const o = open[t.id];
        const who = t.direction === "out" ? `→ ${t.toEmail || ""}` : (t.fromName || t.fromEmail);
        return (
          <div key={t.id} className={`admMailThread__item${o ? " open" : ""}`}>
            <button type="button" onClick={() => toggle(t.id)} aria-expanded={!!o}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><b>{who}</b> · {t.subject}{!o && t.snippet ? <span className="admMuted"> — {t.snippet}</span> : null}</span>
              <span className="admMono" style={{ color: "var(--text-faint)" }}>{t.attachmentCount > 0 ? "📎 " : ""}{t.status && t.status !== "sent" ? `${t.status} · ` : ""}{relTime(t.createdAt)}</span>
            </button>
            {o === "loading" && <div className="admMailThread__body admMuted">Loading…</div>}
            {o && o !== "loading" && (
              <div className="admMailThread__body">
                {o.text || (o.html ? o.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "(no text)")}
                <div style={{ marginTop: 8 }}><button type="button" className="admBtn admBtn--sm" onClick={() => onSelect(t.id)}>Open</button></div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
