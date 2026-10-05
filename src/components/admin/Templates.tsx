"use client";
import { useEffect, useState } from "react";
import { useJson, api, useToast, PageHead, Field, Input, Textarea, Checkbox, ConfirmButton, DateTime, Badge, Empty } from "./shared";
import RichEditor from "./RichEditor";

interface Tpl { id: string; slug: string; name: string; description: string | null; subject: string; html: string; text: string | null; isActive: boolean; version: number; updatedAt: number; versionCount?: number }
interface Version { id: string; version: number; subject: string; changedBy: string | null; changeNote: string | null; createdAt: number }
type Form = { slug: string; name: string; description: string; subject: string; html: string; text: string; isActive: boolean; changeNote: string };
const blank: Form = { slug: "", name: "", description: "", subject: "", html: "<p>Hello {{name}},</p>", text: "", isActive: true, changeNote: "" };
const toForm = (t: Tpl): Form => ({ slug: t.slug, name: t.name, description: t.description ?? "", subject: t.subject, html: t.html, text: t.text ?? "", isActive: t.isActive, changeNote: "" });

export default function Templates({ initialId }: { initialId: string | null }) {
  const list = useJson<{ rows: Tpl[]; sampleVars: Record<string, unknown> }>("/api/admin/emails/templates");
  const [sel, setSel] = useState<string | null>(initialId);
  const [form, setForm] = useState<Form | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [preview, setPreview] = useState<{ subject: string; html: string; text: string } | null>(null);
  const [tab, setTab] = useState<"edit" | "preview" | "text" | "history">("edit");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (patch: Partial<Form>) => setForm((f) => f && ({ ...f, ...patch }));
  useEffect(() => {
    if (!sel) return;
    setIsNew(false);
    api<{ row: Tpl & { versions: Version[] } }>(`/api/admin/emails/templates/${sel}`).then((r) => { setForm(toForm(r.row)); setVersions(r.row.versions); setPreview(null); setTab("edit"); }).catch(toast.err);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);
  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      if (isNew) { const r = await api<{ row: Tpl }>("/api/admin/emails/templates", { method: "POST", json: form }); setIsNew(false); setSel(r.row.id); }
      else if (sel) await api(`/api/admin/emails/templates/${sel}`, { method: "PUT", json: form });
      toast.ok("Saved"); list.reload();
      if (sel && !isNew) { const r = await api<{ row: Tpl & { versions: Version[] } }>(`/api/admin/emails/templates/${sel}`); setVersions(r.row.versions); set({ changeNote: "" }); }
    } catch (e) { toast.err(e); } finally { setBusy(false); }
  }
  async function doPreview(kind: "preview" | "text") {
    if (!sel || !form) return;
    try { setPreview(await api(`/api/admin/emails/templates/${sel}`, { method: "POST", json: { action: "preview", subject: form.subject, html: form.html, text: form.text || undefined } })); setTab(kind); } catch (e) { toast.err(e); }
  }
  async function test() {
    if (!sel || !form) return;
    try { await api(`/api/admin/emails/templates/${sel}`, { method: "POST", json: { action: "test", subject: form.subject, html: form.html, text: form.text || undefined } }); toast.ok("Test sent to your email"); } catch (e) { toast.err(e); }
  }
  async function restore(versionId: string) {
    if (!sel) return;
    try { await api(`/api/admin/emails/templates/${sel}`, { method: "POST", json: { action: "restore", versionId } }); toast.ok("Restored"); setSel(null); setTimeout(() => setSel(sel), 0); list.reload(); } catch (e) { toast.err(e); }
  }
  async function seed(force: boolean) {
    try { const r = await api<{ created: number; updated: number }>(`/api/admin/emails/templates/seed${force ? "?force=1" : ""}`, { method: "POST" }); toast.ok(`Defaults: ${r.created} created, ${r.updated} reset`); list.reload(); } catch (e) { toast.err(e); }
  }
  async function del(id: string) {
    try { await api(`/api/admin/emails/templates/${id}`, { method: "DELETE" }); toast.ok("Deleted"); if (sel === id) { setSel(null); setForm(null); } list.reload(); } catch (e) { toast.err(e); }
  }
  return (
    <>
      {toast.node}
      <PageHead title="Email templates" sub="Transactional emails the site sends. Merge tags like {{name}} and {{plotName}} are filled at send time; {{{sectionsHtml}}} inserts raw HTML.">
        <button className="admBtn" onClick={() => seed(false)}>Create default templates</button>
        <ConfirmButton className="admBtn admBtn--ghost" message="Reset ALL default templates to the built-in versions? Your edits are kept in version history." onConfirm={() => seed(true)}>Reset defaults</ConfirmButton>
        <button className="admBtn admBtn--primary" onClick={() => { setSel(null); setIsNew(true); setForm({ ...blank }); setVersions([]); setPreview(null); setTab("edit"); }}>New template</button>
      </PageHead>
      {list.error && <div className="admNote admNote--err">{list.error}</div>}
      <div className="admSplit admSplit--side">
        <div className="admCard">
          {list.data?.rows.map((t) => (
            <div key={t.id} className={`admMsgRow${sel === t.id ? " sel" : ""}`} onClick={() => setSel(t.id)}>
              <div style={{ minWidth: 0 }}><div className="from">{t.name} {!t.isActive && <Badge kind="dim">inactive</Badge>}</div><div className="subj admMono">{t.slug} · v{t.version}</div></div>
            </div>
          ))}
          {list.data && list.data.rows.length === 0 && <Empty>No templates yet — click “Create default templates”.</Empty>}
        </div>
        <div className="admCard">
          {!form && <Empty>Select a template to edit it.</Empty>}
          {form && (<>
            <div className="admTabs">
              <button className={tab === "edit" ? "on" : ""} onClick={() => setTab("edit")}>Edit</button>
              <button className={tab === "preview" ? "on" : ""} onClick={() => doPreview("preview")} disabled={isNew}>Preview</button>
              <button className={tab === "text" ? "on" : ""} onClick={() => doPreview("text")} disabled={isNew}>Plain text</button>
              <button className={tab === "history" ? "on" : ""} onClick={() => setTab("history")} disabled={isNew}>History ({versions.length})</button>
            </div>
            {tab === "edit" && (
              <form className="admForm" onSubmit={(e) => { e.preventDefault(); save(); }}>
                <Field label="Name"><Input required value={form.name} onChange={(e) => set({ name: e.target.value, slug: isNew ? e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") : form.slug })} /></Field>
                <Field label="Slug" hint="used in code: sendTemplate(slug, …)"><Input required value={form.slug} onChange={(e) => set({ slug: e.target.value })} className="admInput--mono" disabled={!isNew} /></Field>
                <Field label="Subject" className="span2"><Input required value={form.subject} onChange={(e) => set({ subject: e.target.value })} /></Field>
                <Field label="Description" className="span2"><Input value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="When is this sent?" /></Field>
                <div className="span2"><RichEditor value={form.html} onChange={(html) => set({ html })} minHeight={380} /></div>
                <Field label="Plain-text version (optional — generated from HTML when empty)" className="span2"><Textarea value={form.text} onChange={(e) => set({ text: e.target.value })} style={{ minHeight: 120 }} className="admInput--mono" /></Field>
                <Checkbox label="Active (inactive templates fall back to a plain message)" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
                <Field label="Change note" hint="stored with the version"><Input value={form.changeNote} onChange={(e) => set({ changeNote: e.target.value })} /></Field>
                <div className="span2 admRow">
                  <button className="admBtn admBtn--primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
                  {!isNew && <button type="button" className="admBtn" onClick={test}>Send test to me</button>}
                  {!isNew && sel && <ConfirmButton className="admBtn admBtn--danger" message="Delete this template? Sends that use it will fall back to plain text." onConfirm={() => del(sel)}>Delete</ConfirmButton>}
                </div>
                {list.data && <div className="span2 admHint">Available variables: {Object.keys(list.data.sampleVars).map((k) => `{{${k}}}`).join(" ")}</div>}
              </form>
            )}
            {tab === "preview" && preview && <div className="admStack"><div><span className="admLabel">Subject</span> {preview.subject}</div><iframe title="preview" className="admPreview" sandbox="" srcDoc={preview.html} style={{ width: "100%", height: 640, border: "1px solid var(--rule)", background: "#fff" }} /></div>}
            {tab === "text" && preview && <pre className="admPre" style={{ maxHeight: 640 }}>{preview.text}</pre>}
            {tab === "history" && (
              <div className="admTableWrap">
                <table className="admTable"><thead><tr><th>Version</th><th>Subject</th><th>By</th><th>Note</th><th>When</th><th></th></tr></thead>
                  <tbody>{versions.map((v) => <tr key={v.id}><td className="admMono">v{v.version}</td><td>{v.subject}</td><td className="admMono">{v.changedBy || "—"}</td><td>{v.changeNote || <span className="admMuted">—</span>}</td><td><DateTime value={v.createdAt} /></td><td><ConfirmButton className="admBtn admBtn--sm" message={`Restore v${v.version}? The current version is kept in history.`} onConfirm={() => restore(v.id)}>Restore</ConfirmButton></td></tr>)}</tbody>
                </table>
                {versions.length === 0 && <Empty>No earlier versions.</Empty>}
              </div>
            )}
          </>)}
        </div>
      </div>
    </>
  );
}
