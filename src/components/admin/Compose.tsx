"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, useJson } from "./shared";
import RichEditor from "./RichEditor";
import { invalidEmails, kb, parseEmails, quoteToHtml, stripHtml, type AttachmentRow, type ComposePrefill } from "./inbox/types";

interface Tpl { id: string; slug: string; name: string; subject: string; html: string; isActive: boolean }
interface DraftRow { id: string; toEmail: string | null; cc: string | null; subject: string; html: string | null; threadId: string | null; headers: { bcc?: string } | null; attachments: AttachmentRow[] }
interface Form { to: string; cc: string; bcc: string; subject: string; html: string }
const LIMIT = 10 * 1024 * 1024;
const AUTOSAVE_MS = 3000;

/* In-page composer. Everything is a draft row: autosaves a few seconds after
   each edit and on close, attachments upload to the draft, Send posts the
   draft id — the server sends it and removes the draft. */
export default function Compose({ prefill, onClose, onSent, toast }: { prefill: ComposePrefill; onClose: () => void; onSent: (logId: string) => void; toast: { ok: (s: string) => void; err: (e: unknown) => void } }) {
  const [form, setFormState] = useState<Form>({ to: prefill.to || "", cc: prefill.cc || "", bcc: prefill.bcc || "", subject: prefill.subject || "", html: prefill.html || quoteToHtml(prefill.quote || "") });
  const [threadId] = useState(prefill.threadId || "");
  const [draftId, setDraftId] = useState<string | null>(prefill.draftId || null);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [showCc, setShowCc] = useState(!!prefill.cc);
  const [showBcc, setShowBcc] = useState(!!prefill.bcc);
  const [ready, setReady] = useState(!prefill.draftId);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<"send" | "test" | "upload" | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tpls = useJson<{ rows: Tpl[] }>("/api/admin/emails/templates");
  const formRef = useRef(form); const draftRef = useRef(draftId); const dirtyRef = useRef(false); const attRef = useRef(attachments);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastRef = useRef(toast);
  formRef.current = form; draftRef.current = draftId; attRef.current = attachments; toastRef.current = toast;
  const setForm = (patch: Partial<Form>) => { setFormState((f) => ({ ...f, ...patch })); dirtyRef.current = true; setDirty(true); setError(null); };
  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  const save = useCallback(async (opts: { force?: boolean; copyFrom?: string } = {}): Promise<string | null> => {
    const f = formRef.current;
    const empty = !f.to && !f.cc && !f.bcc && !f.subject && !stripHtml(f.html) && !attRef.current.length;
    if (empty && !draftRef.current && !opts.force && !opts.copyFrom) return null;
    setSaving(true);
    try {
      const d = await api<{ row: DraftRow }>("/api/admin/emails/draft", { method: "POST", json: { id: draftRef.current || undefined, to: f.to, cc: f.cc, bcc: f.bcc, subject: f.subject, html: f.html, threadId: threadId || undefined, copyAttachmentsFrom: opts.copyFrom } });
      draftRef.current = d.row.id; setDraftId(d.row.id); dirtyRef.current = false; setDirty(false); setSavedAt(new Date());
      if (opts.copyFrom) setAttachments(d.row.attachments);
      return d.row.id;
    } finally { setSaving(false); }
  }, [threadId]);

  useEffect(() => {
    let alive = true;
    if (prefill.draftId) {
      api<{ row: DraftRow }>(`/api/admin/emails/${prefill.draftId}`).then((d) => {
        if (!alive) return;
        const r = d.row;
        setFormState({ to: r.toEmail || "", cc: r.cc || "", bcc: r.headers?.bcc || "", subject: r.subject || "", html: r.html || "" });
        setShowCc(!!r.cc); setShowBcc(!!r.headers?.bcc); setAttachments(r.attachments || []); setReady(true);
      }).catch((e) => { if (alive) { setError(String((e as Error).message || e)); setReady(true); } });
    } else if (prefill.copyAttachmentsFrom) {
      save({ copyFrom: prefill.copyAttachmentsFrom }).catch((e) => toast.err(e));
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!ready || !dirty) return;
    clearTimer();
    timer.current = setTimeout(() => { save().catch((e) => toastRef.current.err(e)); }, AUTOSAVE_MS);
    return clearTimer;
  }, [form, ready, dirty, save]);

  async function close() { clearTimer(); if (dirtyRef.current) { try { if (await save()) toast.ok("Draft saved"); } catch (e) { toast.err(e); } } onClose(); }
  async function discard() {
    const f = formRef.current;
    if ((f.to || f.subject || stripHtml(f.html) || attachments.length) && !window.confirm("Discard this draft?")) return;
    clearTimer(); dirtyRef.current = false;
    try { if (draftRef.current) await api(`/api/admin/emails/${draftRef.current}`, { method: "DELETE" }); toast.ok("Draft discarded"); onClose(); } catch (e) { toast.err(e); }
  }
  function validate(test: boolean): string | null {
    const f = formRef.current;
    if (!test && !parseEmails(f.to).length) return "Add at least one recipient.";
    const bad = [...invalidEmails(f.to), ...invalidEmails(f.cc), ...invalidEmails(f.bcc)];
    if (bad.length) return `Invalid address: ${bad.join(", ")}`;
    if (!f.subject.trim()) return "Subject is required.";
    return null;
  }
  async function send(test: boolean) {
    const v = validate(test);
    if (v) { setError(v); return; }
    clearTimer(); setBusy(test ? "test" : "send"); setError(null);
    try {
      const id = await save({ force: true });
      const r = await api<{ ok: boolean; logId?: string }>(`/api/admin/emails/draft/${id}/send`, { method: "POST", json: { testToMe: test } });
      if (test) { toast.ok("Test sent to you"); return; }
      toast.ok("Sent"); dirtyRef.current = false;
      if (r.logId) onSent(r.logId);
      onClose();
    } catch (e) { setError(String((e as Error).message || e)); }
    finally { setBusy(null); }
  }
  async function addFiles(files: File[]) {
    if (!files.length) return;
    const total = attachments.reduce((n, a) => n + a.size, 0) + files.reduce((n, f) => n + f.size, 0);
    if (total > LIMIT) { setError(`Attachments would exceed 10 MB (${kb(total)}).`); return; }
    setBusy("upload"); setError(null);
    try {
      const id = draftRef.current || await save({ force: true });
      const fd = new FormData(); files.forEach((f) => fd.append("files", f));
      const res = await fetch(`/api/admin/emails/draft/${id}/attachments`, { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Upload failed");
      setAttachments(d.attachments); toast.ok(`${files.length} file(s) attached`);
    } catch (e) { setError(String((e as Error).message || e)); }
    finally { setBusy(null); }
  }
  async function removeFile(a: AttachmentRow) {
    try { const d = await api<{ attachments: AttachmentRow[] }>(`/api/admin/emails/draft/${draftRef.current}/attachments`, { method: "DELETE", json: { attachmentId: a.id } }); setAttachments(d.attachments); } catch (e) { toast.err(e); }
  }
  const pickTemplate = (id: string) => { const t = tpls.data?.rows.find((x) => x.id === id); if (t) setForm({ subject: t.subject, html: t.html }); };
  const attTotal = attachments.reduce((n, a) => n + a.size, 0);
  const badTo = invalidEmails(form.to).length > 0, badCc = invalidEmails(form.cc).length > 0, badBcc = invalidEmails(form.bcc).length > 0;
  const title = prefill.draftId ? "Draft" : threadId ? "Reply" : "New message";
  const state = saving ? "Saving…" : busy === "upload" ? "Uploading…" : dirty ? "Unsaved" : savedAt ? `Saved ${savedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : "";

  return (
    <div className="admMailCompose" role="dialog" aria-label={title} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}>
      <div className="admMailCompose__hd"><h2 className="admH2">{title}</h2><div className="admRow"><span className="admLabel">{state}</span><button type="button" className="admBtn admBtn--sm admBtn--ghost" onClick={close} title="Close (saves draft)">Close ✕</button></div></div>
      {error && <div className="admMailCompose__err" role="alert">{error}</div>}
      {!ready && <div className="admEmpty" style={{ padding: 20 }}>Loading draft…</div>}
      {ready && (
        <div className="admMailCompose__body">
          <div className={`admMailCompose__line${badTo ? " bad" : ""}`}>
            <label htmlFor="cmp-to">To</label>
            <input id="cmp-to" value={form.to} onChange={(e) => setForm({ to: e.target.value })} placeholder="name@example.com, other@example.com" autoFocus={!prefill.to} spellCheck={false} />
            <span className="admRow" style={{ gap: 4 }}>{!showCc && <button type="button" className="admBtn admBtn--sm admBtn--ghost" onClick={() => setShowCc(true)}>Cc</button>}{!showBcc && <button type="button" className="admBtn admBtn--sm admBtn--ghost" onClick={() => setShowBcc(true)}>Bcc</button>}</span>
          </div>
          {showCc && <div className={`admMailCompose__line${badCc ? " bad" : ""}`}><label htmlFor="cmp-cc">Cc</label><input id="cmp-cc" value={form.cc} onChange={(e) => setForm({ cc: e.target.value })} spellCheck={false} /><span /></div>}
          {showBcc && <div className={`admMailCompose__line${badBcc ? " bad" : ""}`}><label htmlFor="cmp-bcc">Bcc</label><input id="cmp-bcc" value={form.bcc} onChange={(e) => setForm({ bcc: e.target.value })} spellCheck={false} /><span /></div>}
          <div className="admMailCompose__line">
            <label htmlFor="cmp-subj">Subject</label>
            <input id="cmp-subj" value={form.subject} onChange={(e) => setForm({ subject: e.target.value })} autoFocus={!!prefill.to && !prefill.subject} />
            <select className="admInput admInput--sm" defaultValue="" onChange={(e) => { pickTemplate(e.target.value); e.target.value = ""; }} title="Prefill from an email template"><option value="">Template…</option>{tpls.data?.rows.filter((t) => t.isActive !== false).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          </div>
          <div className="admMailCompose__ed"><RichEditor value={form.html} onChange={(html) => setForm({ html })} minHeight={220} /></div>
          <div className="admMailCompose__att">
            <label className="admBtn admBtn--sm">{busy === "upload" ? "Uploading…" : "Attach files"}<input type="file" multiple hidden disabled={busy === "upload"} onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.target.value = ""; }} /></label>
            {attachments.map((a) => <span key={a.id} className="admBadge">📎 {a.filename} · {kb(a.size)} <button type="button" className="admStar" style={{ marginLeft: 4 }} title="Remove" onClick={() => removeFile(a)}>×</button></span>)}
            {attachments.length > 0 && <span className={`admCount${attTotal > LIMIT ? " over" : ""}`}>{kb(attTotal)} / 10 MB</span>}
          </div>
        </div>
      )}
      <div className="admMailCompose__ft">
        <button type="button" className="admBtn admBtn--primary" disabled={!ready || !!busy} onClick={() => send(false)}>{busy === "send" ? "Sending…" : "Send"}</button>
        <button type="button" className="admBtn" disabled={!ready || !!busy} onClick={() => send(true)}>{busy === "test" ? "Sending…" : "Send test to me"}</button>
        <button type="button" className="admBtn" disabled={!ready || saving} onClick={() => save({ force: true }).then((id) => id && toast.ok("Draft saved")).catch((e) => toast.err(e))}>Save draft</button>
        <button type="button" className="admBtn admBtn--danger" disabled={!!busy} onClick={discard}>Discard</button>
        <span style={{ flex: 1 }} />
        {threadId && <span className="admLabel" title={threadId}>in thread</span>}
      </div>
    </div>
  );
}
