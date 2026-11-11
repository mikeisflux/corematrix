"use client";
import { useState } from "react";
import { useJson, api, useToast, PageHead, Input, ConfirmButton, DateTime, Badge } from "./shared";
interface Known { key: string; label: string; group: string; hint?: string; secret?: boolean; readonly?: boolean; value: string; set: boolean; source: string }
interface Resp { groups: { name: string; keys: Known[] }[]; custom: { key: string; value: string; updatedAt: number }[] }
interface Check { ok: boolean; steps: Array<{ name: string; ok: boolean | null; detail: string }> }

export default function Settings() {
  const data = useJson<Resp>("/api/admin/settings");
  const [group, setGroup] = useState<string>("Site");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState({ key: "", value: "" });
  const [testing, setTesting] = useState<"" | "email" | "divinity" | "check">("");
  const [check, setCheck] = useState<(Check & { title: string }) | null>(null);
  const storage = useJson<{ art: { inDb: number; dbMB: number; onR2: number }; logos: { inDb: number; dbMB: number; onR2: number }; configured: boolean; enabled: boolean; publicUrl: string; bucket: string }>(group === "Storage" ? "/api/admin/settings/storage" : null);
  const [moving, setMoving] = useState<{ moved: number; remaining: number; errors: string[] } | null>(null);
  async function moveAll(action: "migrate" | "restore" = "migrate") {
    let moved = 0;
    setMoving({ moved: 0, remaining: -1, errors: [] });
    try {
      for (let i = 0; i < 500; i++) {
        const r = await api<{ moved: number; remaining: number; errors: string[] }>("/api/admin/settings/storage", { method: "POST", json: { action, batch: 20 } });
        moved += r.moved; setMoving({ moved, remaining: r.remaining, errors: r.errors });
        if (r.remaining === 0 || r.moved === 0) break;
      }
      toast.ok(action === "migrate" ? `${moved} files moved to R2` : `${moved} files back in the database`); storage.reload(); setMoving(null);
    } catch (e) { toast.err(e); setMoving(null); }
  }
  const toast = useToast();
  async function save(key: string) {
    const value = edits[key];
    if (value === undefined) return;
    try { await api("/api/admin/settings", { method: "PUT", json: { key, value } }); toast.ok(`${key} saved`); setEdits((e) => { const n = { ...e }; delete n[key]; return n; }); setRevealed((r) => { const n = { ...r }; delete n[key]; return n; }); data.reload(); } catch (e) { toast.err(e); }
  }
  async function reveal(key: string) { try { const r = await api<{ value: string }>(`/api/admin/settings?reveal=1&key=${encodeURIComponent(key)}`); setRevealed((x) => ({ ...x, [key]: r.value })); setEdits((e) => ({ ...e, [key]: r.value })); } catch (e) { toast.err(e); } }
  async function clear(key: string) { try { await api("/api/admin/settings", { method: "DELETE", json: { key } }); toast.ok(`${key} cleared`); data.reload(); } catch (e) { toast.err(e); } }
  async function test(kind: "email" | "divinity") {
    setTesting(kind);
    try {
      if (kind === "email") { const r = await api<{ to: string }>("/api/admin/settings/test-email", { method: "POST" }); toast.ok(`Test email sent to ${r.to}`); }
      else { const r = await api<{ ok: boolean; detail: string; webhookUrl: string }>("/api/admin/settings/test-divinity", { method: "POST" }); if (r.ok) toast.ok(`DivinityCoin reachable: ${r.detail.slice(0, 80)}`); else toast.err(`DivinityCoin: ${r.detail}`); }
    } catch (e) { toast.err(e); } finally { setTesting(""); }
  }
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.ok("Copied"));
  const g = data.data?.groups.find((x) => x.name === group);
  return (
    <>
      {toast.node}
      <PageHead title="Settings" sub="Every API key and switch the site needs. Values are stored in the database and override .env; secrets are masked until you reveal them.">
        <button className="admBtn admBtn--primary" disabled={testing !== ""} onClick={async () => { setTesting("check"); setCheck(null); try { setCheck({ title: "Email setup", ...(await api<Check>("/api/admin/settings/email-check", { method: "POST" })) }); } catch (e) { toast.err(e); } finally { setTesting(""); } }}>{testing === "check" ? "Checking…" : "Check email setup"}</button>
        <button className="admBtn" disabled={testing !== ""} onClick={() => test("email")}>{testing === "email" ? "Sending…" : "Send test email"}</button>
        <button className="admBtn" disabled={testing !== ""} onClick={() => test("divinity")}>{testing === "divinity" ? "Checking…" : "Test DivinityCoin"}</button>
      </PageHead>
      {data.error && <div className="admNote admNote--err">{data.error}</div>}
      {check && (
        <div className={`admCard`} style={{ marginBottom: 16, borderColor: check.ok ? "var(--highlight)" : "var(--heat-6)" }}>
          <div className="admCard__hd"><h2 className="admH2">{check.title} {check.ok ? "✓ all good" : "✗ needs attention"}</h2><button className="admBtn admBtn--sm" onClick={() => setCheck(null)}>Close</button></div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {check.steps.map((s) => (
              <li key={s.name} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--rule)" }}>
                <span style={{ width: 20, fontWeight: 700, color: s.ok === true ? "var(--highlight)" : s.ok === false ? "var(--heat-6)" : "var(--muted)" }}>{s.ok === true ? "✓" : s.ok === false ? "✗" : "•"}</span>
                <div><div style={{ fontWeight: 600 }}>{s.name}</div><div className="admMuted" style={{ wordBreak: "break-word" }}>{s.detail}</div></div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="admTabs" style={{ marginBottom: 16 }}>
        {data.data?.groups.map((x) => <button key={x.name} className={group === x.name ? "on" : ""} onClick={() => setGroup(x.name)}>{x.name} <span className="admMuted">{x.keys.filter((k) => k.set).length}/{x.keys.length}</span></button>)}
        <button className={group === "Custom" ? "on" : ""} onClick={() => setGroup("Custom")}>Custom</button>
      </div>
      {group === "Storage" && storage.data && (
        <div className="admCard" style={{ marginBottom: 16 }}>
          <div className="admCard__hd"><h2 className="admH2">Uploaded images {storage.data.enabled && storage.data.configured ? <Badge kind="ok">R2 on</Badge> : storage.data.configured ? <Badge kind="dim">R2 configured, off</Badge> : <Badge kind="dim">in the database</Badge>}</h2>
            <div className="admRow">
              <button className="admBtn" disabled={testing !== "" || !storage.data.configured} onClick={async () => { setTesting("check"); setCheck(null); try { setCheck({ title: "R2 storage", ...(await api<Check>("/api/admin/settings/storage", { method: "POST", json: { action: "test" } })) }); } catch (e) { toast.err(e); } finally { setTesting(""); } }}>{testing === "check" ? "Testing…" : "Test R2"}</button>
              <ConfirmButton className="admBtn admBtn--primary" disabled={!storage.data.enabled || !storage.data.configured || !!moving || storage.data.art.inDb + storage.data.logos.inDb === 0} message={`Move ${storage.data.art.inDb} art files and ${storage.data.logos.inDb} logos from the database to the bucket ${storage.data.bucket}? Visitors keep seeing everything; the database shrinks by about ${(storage.data.art.dbMB + storage.data.logos.dbMB).toFixed(0)} MB.`} onConfirm={() => moveAll("migrate")}>{moving ? `Moving… ${moving.moved} done` : "Move existing uploads to R2"}</ConfirmButton>
              {storage.data.art.onR2 + storage.data.logos.onR2 > 0 && <ConfirmButton className="admBtn admBtn--ghost" disabled={!storage.data.configured || !!moving} message={`Copy ${storage.data.art.onR2} art files and ${storage.data.logos.onR2} logos from R2 back into the database? Use this before closing the bucket.`} onConfirm={() => moveAll("restore")}>Move back into the database</ConfirmButton>}
            </div>
          </div>
          <table className="admTable"><thead><tr><th>What</th><th>Still in the database</th><th>On R2</th></tr></thead><tbody>
            <tr><td>Booth art (banners, covers, portfolio, product photos)</td><td>{storage.data.art.inDb} files · {storage.data.art.dbMB} MB</td><td>{storage.data.art.onR2}</td></tr>
            <tr><td>Logos</td><td>{storage.data.logos.inDb} files · {storage.data.logos.dbMB} MB</td><td>{storage.data.logos.onR2}</td></tr>
          </tbody></table>
          <p className="admHint" style={{ marginTop: 10 }}>How it works: with the keys below filled in and <span className="admMono">R2_ENABLED</span> true, every new upload goes straight to the bucket and the database keeps only a reference. Visitors&apos; links do not change (/api/art/… and /api/logo/… send them to {storage.data.publicUrl || "the bucket through the server (set a public URL to serve from Cloudflare directly)"}). Moving existing uploads is safe to repeat and to interrupt.</p>
          {moving && moving.errors.length > 0 && <div className="admNote admNote--err" style={{ marginTop: 10 }}>{moving.errors.map((e) => <div key={e}>{e}</div>)}</div>}
        </div>
      )}
      {g && (
        <div className="admCard">
          {g.keys.map((k) => {
            const editing = edits[k.key] !== undefined;
            const shown = editing ? edits[k.key] : k.value;
            return (
              <div key={k.key} className="admField" style={{ borderBottom: "1px solid var(--rule)", padding: "12px 0" }}>
                <label>{k.label} <span className="admMono admMuted" style={{ marginLeft: 8 }}>{k.key}</span> {k.set ? <Badge kind="ok">{k.source || "set"}</Badge> : <Badge kind="dim">not set</Badge>}</label>
                {k.readonly ? (
                  <div className="admRow"><span className="admMono">{k.value}</span><button className="admBtn admBtn--sm" onClick={() => copy(k.value)}>Copy</button></div>
                ) : (
                  <div className="admRow">
                    <Input value={shown} type={k.secret && !revealed[k.key] && !editing ? "password" : "text"} placeholder={k.hint} className={k.secret ? "admInput--mono" : ""} readOnly={k.secret && !editing}
                      onFocus={() => { if (k.secret && !editing) reveal(k.key); else if (!editing) setEdits((e) => ({ ...e, [k.key]: k.value })); }}
                      onChange={(e) => setEdits((x) => ({ ...x, [k.key]: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") save(k.key); }} />
                    <button className="admBtn admBtn--sm admBtn--primary" disabled={!editing} onClick={() => save(k.key)}>Save</button>
                    {editing && <button className="admBtn admBtn--sm" onClick={() => { setEdits((e) => { const n = { ...e }; delete n[k.key]; return n; }); setRevealed((r) => { const n = { ...r }; delete n[k.key]; return n; }); }}>Cancel</button>}
                    {k.set && k.source === "db" && !editing && <ConfirmButton className="admBtn admBtn--sm admBtn--ghost" message={`Clear ${k.key}? The .env value (if any) applies again.`} onConfirm={() => clear(k.key)}>Clear</ConfirmButton>}
                  </div>
                )}
                {k.hint && <span className="admHint">{k.hint}</span>}
              </div>
            );
          })}
        </div>
      )}
      {group === "Custom" && data.data && (
        <div className="admCard">
          <div className="admCard__hd"><h2 className="admH2">Custom keys</h2></div>
          <p className="admHint">Any extra key/value the code reads with getSetting(). Keys are UPPER_SNAKE_CASE.</p>
          <form className="admRow" onSubmit={async (e) => { e.preventDefault(); try { await api("/api/admin/settings", { method: "PUT", json: custom }); toast.ok("Saved"); setCustom({ key: "", value: "" }); data.reload(); } catch (err) { toast.err(err); } }}>
            <Input placeholder="KEY_NAME" value={custom.key} onChange={(e) => setCustom({ ...custom, key: e.target.value.toUpperCase() })} className="admInput--mono" style={{ maxWidth: 240 }} required />
            <Input placeholder="value" value={custom.value} onChange={(e) => setCustom({ ...custom, value: e.target.value })} required />
            <button className="admBtn admBtn--primary">Add</button>
          </form>
          <div className="admTableWrap"><table className="admTable"><thead><tr><th>Key</th><th>Value</th><th>Updated</th><th></th></tr></thead>
            <tbody>{data.data.custom.map((c) => <tr key={c.key}><td className="admMono">{c.key}</td><td style={{ wordBreak: "break-all" }}>{c.value}</td><td><DateTime value={c.updatedAt} /></td><td><ConfirmButton className="admBtn admBtn--sm admBtn--danger" message={`Delete ${c.key}?`} onConfirm={() => clear(c.key)}>Delete</ConfirmButton></td></tr>)}</tbody>
          </table></div>
        </div>
      )}
    </>
  );
}
