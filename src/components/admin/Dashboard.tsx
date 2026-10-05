"use client";
import Link from "next/link";
import { useJson, Badge, Money, DateTime, PageHead, Empty } from "./shared";
interface Stats {
  revenue: { today: number; week: number; month: number; lifetime: number; txToday: number; txLifetime: number };
  pending: number; disputes: number; booths: number; boothValue: number; users: number; unread: number; failedEmails: number; webhookFailures: number;
  mrr: number; plans: Record<string, number>; divinity: { ok: boolean; detail: string }; testMode: boolean; visits7d: number; clicks7d: number; signups7d: number;
  checks: { label: string; ok: boolean; hint: string }[];
  recentTx: { id: string; kind: string; boothId: number; status: string; amountCents: number; createdAt: number; provider: string }[];
  recentInbox: { id: string; fromEmail: string; fromName: string | null; subject: string; read: boolean; createdAt: number; channel: string }[];
}
const HEAT = ["var(--heat-1)", "var(--heat-2)", "var(--heat-3)", "var(--heat-4)", "var(--heat-5)", "var(--heat-6)", "var(--heat-7)"];
export default function Dashboard() {
  const { data, error, loading, reload } = useJson<Stats>("/api/admin/stats");
  return (
    <>
      <PageHead title="Dashboard" sub="Revenue counts paid transactions through DivinityCoin (claims, takeovers, boosts, plans, coins, billboards)."><button className="admBtn" onClick={reload}>Refresh</button></PageHead>
      {error && <div className="admNote admNote--err">{error}</div>}
      {loading && !data && <div className="admMuted">Loading…</div>}
      {data && (<>
        {data.testMode && <div className="admNote">DivinityCoin test mode is ON: checkouts use the local simulator and nothing is charged. Turn it off in Settings → DivinityCoin before launch.</div>}
        <div className="admGrid">
          <Tile c={HEAT[0]} label="Revenue today" value={<Money cents={data.revenue.today} />} sub={`${data.revenue.txToday} payments`} />
          <Tile c={HEAT[1]} label="Last 7 days" value={<Money cents={data.revenue.week} />} />
          <Tile c={HEAT[2]} label="Last 30 days" value={<Money cents={data.revenue.month} />} />
          <Tile c={HEAT[3]} label="Lifetime" value={<Money cents={data.revenue.lifetime} />} sub={`${data.revenue.txLifetime} paid`} />
          <Tile c={HEAT[6]} label="MRR (plans)" value={<Money cents={data.mrr} />} sub={Object.entries(data.plans).map(([k, v]) => `${k}: ${v}`).join(" · ") || "no paid plans"} href="/admin/plans" />
          <Tile c={HEAT[4]} label="Booths claimed" value={data.booths} sub={`floor value ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(data.boothValue / 100)}`} href="/admin/booths" />
          <Tile c={HEAT[5]} label="Users" value={data.users} sub={`${data.signups7d} new this week`} href="/admin/users" />
          <Tile c={data.pending ? "var(--heat-7)" : undefined} label="Pending checkouts" value={data.pending} href="/admin/transactions?status=pending" />
          <Tile c={data.disputes ? "var(--heat-6)" : undefined} label="Disputes" value={data.disputes} href="/admin/transactions?status=disputed" />
          <Tile c={data.unread ? "var(--primary)" : undefined} label="Unread inbox" value={data.unread} href="/admin/emails" />
          <Tile c={data.failedEmails ? "var(--heat-6)" : undefined} label="Failed emails" value={data.failedEmails} href="/admin/emails/logs" />
          <Tile c={data.webhookFailures ? "var(--heat-6)" : undefined} label="Webhook failures" value={data.webhookFailures} href="/admin/webhooks?status=failed" />
          <Tile c={HEAT[1]} label="Visits · 7d" value={data.visits7d.toLocaleString()} sub={`${data.clicks7d.toLocaleString()} outbound clicks delivered`} />
          <Tile c={data.divinity.ok ? "var(--heat-1)" : "var(--heat-6)"} label="DivinityCoin" value={data.divinity.ok ? "OK" : "DOWN"} sub={data.divinity.detail.slice(0, 80)} />
        </div>
        <div className="admSplit">
          <div className="admCard">
            <div className="admCard__hd"><h2 className="admH2">Recent transactions</h2><Link className="admBtn admBtn--sm" href="/admin/transactions">All</Link></div>
            {data.recentTx.length === 0 ? <Empty>No transactions yet.</Empty> : (
              <div className="admTableWrap"><table className="admTable"><thead><tr><th>Kind</th><th>Booth</th><th>Status</th><th>Amount</th><th>When</th></tr></thead>
                <tbody>{data.recentTx.map((o) => <tr key={o.id}><td><Link href={`/admin/transactions/${o.id}`}>{o.kind}</Link></td><td className="admMono">{o.boothId ? `#${o.boothId}` : "—"}</td><td><Badge>{o.status}</Badge></td><td className="num"><Money cents={o.amountCents} /></td><td><DateTime value={o.createdAt} /></td></tr>)}</tbody>
              </table></div>
            )}
          </div>
          <div className="admCard">
            <div className="admCard__hd"><h2 className="admH2">Inbox</h2><Link className="admBtn admBtn--sm" href="/admin/emails">Open inbox</Link></div>
            {data.recentInbox.length === 0 ? <Empty>No messages. Point SendGrid Inbound Parse at the inbound webhook (see Webhooks).</Empty> : (
              <div className="admTableWrap"><table className="admTable"><thead><tr><th>From</th><th>Subject</th><th>When</th></tr></thead>
                <tbody>{data.recentInbox.map((m) => <tr key={m.id} className={m.read ? "" : "unread"}><td>{m.fromName || m.fromEmail}</td><td><Link href={`/admin/emails?id=${m.id}`}>{m.subject}</Link></td><td><DateTime value={m.createdAt} /></td></tr>)}</tbody>
              </table></div>
            )}
          </div>
        </div>
        <div className="admCard">
          <div className="admCard__hd"><h2 className="admH2">System checks</h2><Link className="admBtn admBtn--sm" href="/admin/settings">Settings</Link></div>
          <div className="admTableWrap"><table className="admTable"><tbody>{data.checks.map((c) => <tr key={c.label}><td>{c.label}</td><td><Badge kind={c.ok ? "ok" : "bad"}>{c.ok ? "OK" : "Missing"}</Badge></td><td className="admMuted admMono">{c.hint}</td></tr>)}</tbody></table></div>
        </div>
      </>)}
    </>
  );
}
function Tile({ label, value, sub, c, href }: { label: string; value: React.ReactNode; sub?: string; c?: string; href?: string }) {
  const body = <div className="admTile" style={c ? ({ "--c": c } as React.CSSProperties) : undefined}><div className="admLabel">{label}</div><div className="admTile__n">{value}</div>{sub && <div className="admTile__sub">{sub}</div>}</div>;
  return href ? <Link href={href} style={{ color: "inherit" }}>{body}</Link> : body;
}
