"use client";
import { useState } from "react";
import { useJson, api, useToast, Pager, PageHead, Badge, DateTime, Select, SearchBox, qs, Empty, Field, Input, ConfirmButton } from "./shared";
import { BOOTH_SIZES } from "@/lib/config";
interface Row { id: string; code: string; size: string; label: string | null; maxUses: number; uses: number; expiresAt: number | null; createdAt: number; revokedAt: number | null; redeemedBy: string | null; booths: string | null }
interface Resp { rows: Row[]; total: number; pages: number; open: number; redeemed: number }
const pretty = (c: string) => `${c.slice(0, 3)}-${c.slice(3, 7)}-${c.slice(7)}`;
const sizeName = (s: string) => (s === "any" ? "Any booth" : BOOTH_SIZES[s as keyof typeof BOOTH_SIZES]?.name ?? s);
export default function Codes() {
  const [q, setQ] = useState(""); const [size, setSize] = useState(""); const [status, setStatus] = useState("open"); const [page, setPage] = useState(1);
  const [gen, setGen] = useState({ size: "10x10", count: "10", label: "", maxUses: "1", expiresDays: "" });
  const [made, setMade] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useJson<Resp>(`/api/admin/codes?${qs({ q, size, status, page })}`);
  const toast = useToast();
  const generate = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { const r = await api<{ codes: string[] }>("/api/admin/codes", { method: "POST", json: { ...gen, count: Number(gen.count), maxUses: Number(gen.maxUses), expiresDays: Number(gen.expiresDays) || 0 } }); setMade(r.codes); toast.ok(`${r.codes.length} code${r.codes.length === 1 ? "" : "s"} generated`); list.reload(); }
    catch (err) { toast.err(err); }
    setBusy(false);
  };
  const revoke = async (id: string, revoked: boolean) => { try { await api("/api/admin/codes", { method: "PATCH", json: { id, revoked } }); list.reload(); } catch (e) { toast.err(e); } };
  const state = (r: Row) => r.revokedAt ? <Badge kind="dim">revoked</Badge> : r.uses >= r.maxUses ? <Badge>used</Badge> : r.expiresAt && r.expiresAt < Date.now() ? <Badge kind="dim">expired</Badge> : <Badge kind="ok">open</Badge>;
  return (
    <>
      {toast.node}
      <PageHead title="Booth codes" sub="Generate codes that pay for a booth of a given size. People redeem them in the hall: pick a space, set up the booth, enter the code instead of paying.">
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Code or label…" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={[{ value: "open", label: "Open" }, { value: "used", label: "Used up" }, { value: "revoked", label: "Revoked" }, { value: "all", label: "All" }]} />
        <Select value={size} onChange={(e) => { setSize(e.target.value); setPage(1); }} options={[{ value: "", label: "Any size" }, ...Object.entries(BOOTH_SIZES).map(([k, v]) => ({ value: k, label: v.name })), { value: "any", label: "Wildcard (any booth)" }]} />
        <a className="admBtn" href={`/api/admin/codes?${qs({ q, size, status, export: "csv" })}`}>Export CSV</a>
      </PageHead>
      <div className="admGrid">
        <div className="admTile" style={{ ["--c" as string]: "var(--highlight)" }}><div className="admLabel">Redemptions left</div><div className="admTile__n">{list.data?.open ?? "–"}</div><div className="admTile__sub">across open codes</div></div>
        <div className="admTile"><div className="admLabel">Redeemed</div><div className="admTile__n">{list.data?.redeemed ?? "–"}</div><div className="admTile__sub">booths claimed with a code</div></div>
      </div>
      <div className="admSplit">
        <div className="admCard">
          <div className="admCard__hd"><h2 className="admH2">Generate</h2></div>
          <form onSubmit={generate} className="admForm">
            <Field label="Booth size"><Select value={gen.size} onChange={(e) => setGen({ ...gen, size: e.target.value })} options={[...Object.entries(BOOTH_SIZES).map(([k, v]) => ({ value: k, label: `${v.name} (${v.short})` })), { value: "any", label: "Wildcard: any booth" }]} /></Field>
            <Field label="How many codes"><Input type="number" min={1} max={500} value={gen.count} onChange={(e) => setGen({ ...gen, count: e.target.value })} /></Field>
            <Field label="Label" hint="Who they're for: a show, a sponsor, a giveaway" className="span2"><Input value={gen.label} onChange={(e) => setGen({ ...gen, label: e.target.value })} placeholder="e.g. NYCC 2026 artists" /></Field>
            <Field label="Uses per code" hint="1 = single use. A shared code for a whole group can allow many."><Input type="number" min={1} max={10000} value={gen.maxUses} onChange={(e) => setGen({ ...gen, maxUses: e.target.value })} /></Field>
            <Field label="Expires in (days)" hint="blank = never"><Input type="number" min={0} value={gen.expiresDays} onChange={(e) => setGen({ ...gen, expiresDays: e.target.value })} placeholder="never" /></Field>
            <div className="span2"><button className="admBtn admBtn--primary" disabled={busy}>{busy ? "Generating…" : "Generate codes"}</button></div>
          </form>
          {made && (
            <div style={{ marginTop: 12 }}>
              <div className="admCard__hd"><h3 className="admH2">Fresh codes</h3><button className="admBtn admBtn--sm" onClick={() => navigator.clipboard.writeText(made.join("\n")).then(() => toast.ok("Copied"))}>Copy all</button></div>
              <pre className="admMono" style={{ whiteSpace: "pre-wrap", fontSize: 13, margin: 0, maxHeight: 220, overflow: "auto" }}>{made.join("\n")}</pre>
              <p className="admMuted">Hand these out. Each one claims a {sizeName(gen.size).toLowerCase()} for free; it is counted as used the moment the booth goes live.</p>
            </div>
          )}
        </div>
        <div className="admCard">
          <div className="admCard__hd"><h2 className="admH2">How people redeem</h2></div>
          <ol className="admMuted" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
            <li>In the hall, press <b>Get a booth</b> (or click any open space) and pick a space of the size the code covers.</li>
            <li>Set up the booth: name, banner, logo, links.</li>
            <li>Under the price, open <b>Have a booth code?</b>, enter it, and the total drops to $0.</li>
            <li>Press <b>Claim with code</b>. The booth is live at once; the code shows as used here with their email.</li>
          </ol>
        </div>
      </div>
      <div className="admCard">
        {list.error ? <div className="admNote admNote--err">{list.error}</div> : !list.data ? <Empty>Loading…</Empty> : list.data.rows.length === 0 ? <Empty>No codes yet.</Empty> : (
          <div className="admTableWrap"><table className="admTable"><thead><tr><th>Code</th><th>Size</th><th>Label</th><th className="num">Uses</th><th>Expires</th><th>State</th><th>Redeemed by</th><th>Made</th><th></th></tr></thead><tbody>
            {list.data.rows.map((r) => (
              <tr key={r.id}>
                <td className="admMono"><button className="admBtn admBtn--sm" onClick={() => navigator.clipboard.writeText(pretty(r.code)).then(() => toast.ok("Copied"))} title="Copy">{pretty(r.code)}</button></td>
                <td>{sizeName(r.size)}</td><td>{r.label ?? <span className="admMuted">–</span>}</td>
                <td className="num">{r.uses} / {r.maxUses}</td>
                <td>{r.expiresAt ? <DateTime value={r.expiresAt} dateOnly /> : <span className="admMuted">never</span>}</td>
                <td>{state(r)}</td>
                <td className="admMuted">{r.redeemedBy ?? "–"}{r.booths && <span className="admMono"> · #{r.booths}</span>}</td>
                <td><DateTime value={r.createdAt} dateOnly /></td>
                <td>{r.revokedAt ? <button className="admBtn admBtn--sm" onClick={() => revoke(r.id, false)}>Restore</button> : <ConfirmButton className="admBtn admBtn--sm" message={`Revoke ${pretty(r.code)}? It can't be redeemed any more.`} onConfirm={() => revoke(r.id, true)}>Revoke</ConfirmButton>}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
        {list.data && <Pager page={page} pages={list.data.pages} total={list.data.total} onPage={setPage} />}
      </div>
    </>
  );
}
