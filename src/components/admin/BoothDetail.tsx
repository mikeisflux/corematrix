"use client";
import Link from "next/link";
import { useState } from "react";
import { useJson, api, useToast, PageHead, Badge, Money, DateTime, ConfirmButton, Field, Input, Textarea, Checkbox, Empty } from "./shared";
interface Plot { id: number; ownerId: string | null; name: string | null; tagline: string | null; description: string | null; website: string | null; tier: string; tierUntil: number | null; subscriptionStatus: string | null; district: string; floors: number; valueCents: number; claimedAt: number | null; hidden: boolean; notForSaleUntil: number | null; featuredUntil: number | null; totalViews: number; totalClicks: number; totalImpressions: number; salesCount: number }
interface Resp { plot: Plot; owner: { id: string; email: string } | null; txs: { id: string; kind: string; status: string; amountCents: number; createdAt: number }[]; series: { day: string; views: number; clicks: number; impressions: number }[]; referrers: { host: string; clicks: number }[] }
export default function BoothDetail({ id }: { id: string }) {
  const d = useJson<Resp>(`/api/admin/booths/${id}`);
  const [form, setForm] = useState<Partial<Plot> | null>(null);
  const [transfer, setTransfer] = useState("");
  const toast = useToast();
  const p = d.data?.plot;
  const f = { ...(p ?? {}), ...(form ?? {}) } as Plot;
  const act = async (json: Record<string, unknown>, msg: string) => { try { await api(`/api/admin/booths/${id}`, { method: "PATCH", json }); toast.ok(msg); setForm(null); d.reload(); } catch (e) { toast.err(e); } };
  if (d.error) return <div className="admNote admNote--err">{d.error}</div>;
  if (!p) return <div className="admMuted">Loading…</div>;
  const views7 = d.data!.series.slice(-7).reduce((a, r) => a + r.views, 0), clicks7 = d.data!.series.slice(-7).reduce((a, r) => a + r.clicks, 0);
  return (
    <>
      {toast.node}
      <PageHead title={`Booth #${p.id}${p.name ? ` — ${p.name}` : ""}`} sub={`${p.district} · ${p.floors} floors · owner ${d.data!.owner?.email ?? "none"}`}>
        <Link className="admBtn" href={`/plot/${p.id}`} target="_blank">View public page</Link>
        {d.data!.owner && <Link className="admBtn" href={`/admin/emails?compose=1&to=${encodeURIComponent(d.data!.owner.email)}&subject=${encodeURIComponent(`About your booth #${p.id}`)}`}>Email owner</Link>}
        {p.ownerId && <ConfirmButton className="admBtn admBtn--danger" message="Release this booth? The owner loses it, any plan is canceled, and the space becomes available again." onConfirm={() => act({ action: "release", reason: "released by admin" }, "Released")}>Release</ConfirmButton>}
      </PageHead>
      <div className="admGrid">
        <div className="admTile"><div className="admLabel">Value</div><div className="admTile__n"><Money cents={p.valueCents} /></div><div className="admTile__sub">{p.salesCount} sales</div></div>
        <div className="admTile"><div className="admLabel">Plan</div><div className="admTile__n">{p.tier}</div>{p.tierUntil && <div className="admTile__sub">{p.subscriptionStatus} · until {new Date(p.tierUntil).toLocaleDateString()}</div>}</div>
        <div className="admTile"><div className="admLabel">Views · 7d</div><div className="admTile__n">{views7.toLocaleString()}</div><div className="admTile__sub">{p.totalViews.toLocaleString()} lifetime</div></div>
        <div className="admTile"><div className="admLabel">Clicks · 7d</div><div className="admTile__n">{clicks7.toLocaleString()}</div><div className="admTile__sub">{p.totalClicks.toLocaleString()} lifetime</div></div>
      </div>
      <div className="admSplit">
        <div className="admCard">
          <div className="admCard__hd"><h2 className="admH2">Listing</h2>{p.hidden && <Badge kind="dim">hidden</Badge>}</div>
          <form className="admForm" onSubmit={(e) => { e.preventDefault(); act({ name: f.name ?? "", tagline: f.tagline ?? "", description: f.description ?? "", website: f.website ?? "", hidden: f.hidden, valueCents: f.valueCents }, "Saved"); }}>
            <Field label="Name"><Input value={f.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Website"><Input value={f.website ?? ""} onChange={(e) => setForm({ ...form, website: e.target.value })} /></Field>
            <Field label="Tagline" className="span2"><Input value={f.tagline ?? ""} onChange={(e) => setForm({ ...form, tagline: e.target.value })} /></Field>
            <Field label="Description" className="span2"><Textarea value={f.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ minHeight: 90 }} /></Field>
            <Field label="Value (cents)" hint="takeover price = value × multiplier"><Input type="number" value={f.valueCents} onChange={(e) => setForm({ ...form, valueCents: Number(e.target.value) })} /></Field>
            <Checkbox label="Hidden from the hall (moderation)" checked={!!f.hidden} onChange={(e) => setForm({ ...form, hidden: e.target.checked })} />
            <div className="span2 admRow"><button className="admBtn admBtn--primary" disabled={!form}>Save</button></div>
          </form>
        </div>
        <div className="admStack">
          <div className="admCard">
            <div className="admCard__hd"><h2 className="admH2">Protection & promotion</h2></div>
            <div className="admRow" style={{ flexWrap: "wrap" }}>
              <span className="admLabel">Takeover shield {p.notForSaleUntil && p.notForSaleUntil > Date.now() ? `until ${new Date(p.notForSaleUntil).toLocaleDateString()}` : "off"}</span>
              <button className="admBtn admBtn--sm" onClick={() => act({ action: "shield", days: 7 }, "Shielded 7 days")}>+7d</button><button className="admBtn admBtn--sm" onClick={() => act({ action: "shield", days: 30 }, "Shielded 30 days")}>+30d</button><button className="admBtn admBtn--sm admBtn--ghost" onClick={() => act({ action: "shield", days: 0 }, "Shield removed")}>Remove</button>
            </div>
            <div className="admRow" style={{ flexWrap: "wrap", marginTop: 8 }}>
              <span className="admLabel">Featured {p.featuredUntil && p.featuredUntil > Date.now() ? `until ${new Date(p.featuredUntil).toLocaleDateString()}` : "no"}</span>
              <button className="admBtn admBtn--sm" onClick={() => act({ action: "feature", days: 7 }, "Featured 7 days")}>+7d</button><button className="admBtn admBtn--sm admBtn--ghost" onClick={() => act({ action: "feature", days: 0 }, "Unfeatured")}>Remove</button>
            </div>
          </div>
          <div className="admCard">
            <div className="admCard__hd"><h2 className="admH2">Transfer</h2></div>
            <form className="admRow" onSubmit={(e) => { e.preventDefault(); if (transfer && window.confirm(`Transfer booth #${p.id} to ${transfer}?`)) act({ action: "transfer", email: transfer }, "Transferred").then(() => setTransfer("")); }}>
              <Input placeholder="new owner's email" value={transfer} onChange={(e) => setTransfer(e.target.value)} type="email" required /><button className="admBtn">Transfer</button>
            </form>
          </div>
          <div className="admCard">
            <div className="admCard__hd"><h2 className="admH2">Top referrers</h2></div>
            {d.data!.referrers.length === 0 ? <Empty>No outbound clicks tracked yet.</Empty> : <div className="admTableWrap"><table className="admTable"><tbody>{d.data!.referrers.slice(0, 8).map((r) => <tr key={r.host}><td className="admMono">{r.host}</td><td className="num">{r.clicks}</td></tr>)}</tbody></table></div>}
          </div>
        </div>
      </div>
      <div className="admCard">
        <div className="admCard__hd"><h2 className="admH2">Transactions</h2></div>
        {d.data!.txs.length === 0 ? <Empty>None.</Empty> : <div className="admTableWrap"><table className="admTable"><thead><tr><th>Kind</th><th>Status</th><th>Amount</th><th>When</th></tr></thead><tbody>{d.data!.txs.map((t) => <tr key={t.id}><td><Link href={`/admin/transactions/${t.id}`}>{t.kind}</Link></td><td><Badge>{t.status}</Badge></td><td className="num"><Money cents={t.amountCents} /></td><td><DateTime value={t.createdAt} /></td></tr>)}</tbody></table></div>}
      </div>
    </>
  );
}
