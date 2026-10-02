import { redirect } from "next/navigation";
import { desc, sql } from "drizzle-orm";
import { Shell } from "@/components/pages/Shell";
import { currentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { siteSeries } from "@/lib/analytics";
import { siteStats } from "@/lib/economy";
import { formatCount, formatMoney } from "@/lib/config";
import { Bars } from "@/components/ui/Sparkline";
import { timeAgo } from "@/lib/util";

export const metadata = { title: "Operator dashboard" };
export const dynamic = "force-dynamic";

/** The numbers an operator should look at daily. */
export default async function Admin() {
  const u = await currentUser();
  if (!u?.isAdmin) redirect("/");
  const [series, stats] = await Promise.all([siteSeries(30), siteStats()]);
  const sum = (k: keyof (typeof series)[number], n = 30) => series.slice(-n).reduce((a, r) => a + Number(r[k]), 0);
  const [users] = await db.select({ n: sql<number>`count(*)` }).from(schema.users);
  const [owners] = await db.select({ n: sql<number>`count(distinct owner_id)` }).from(schema.plots).where(sql`owner_id IS NOT NULL`);
  const [paid] = await db.select({ n: sql<number>`count(distinct buyer_id)`, tx: sql<number>`count(*)` }).from(schema.transactions).where(sql`status = 'paid'`);
  const [tiers] = await db.select({ pro: sql<number>`sum(case when tier='pro' then 1 else 0 end)`, lm: sql<number>`sum(case when tier='landmark' then 1 else 0 end)` }).from(schema.plots);
  const recent = await db.select().from(schema.transactions).where(sql`status = 'paid'`).orderBy(desc(schema.transactions.createdAt)).limit(25);
  const byKind = await db.select({ kind: schema.transactions.kind, n: sql<number>`count(*)`, rev: sql<number>`sum(amount_cents)` }).from(schema.transactions).where(sql`status = 'paid'`).groupBy(schema.transactions.kind);
  const rev7 = sum("revenueCents", 7), rev30 = sum("revenueCents");
  const visits7 = sum("visits", 7), checkout7 = sum("checkoutStarts", 7), claims7 = sum("claims", 7) + sum("takeovers", 7);
  const mrr = Number(tiers?.pro ?? 0) * 900 + Number(tiers?.lm ?? 0) * 4900;
  return (
    <Shell wide>
      <h1 className="text-3xl font-bold">Operator dashboard</h1>
      <p className="text-sm text-slate-400">Revenue, growth and engagement. If a number here isn't moving, that's the week's job.</p>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        <K label="Revenue 7d" v={formatMoney(rev7)} sub={`${formatMoney(rev30)} / 30d`} accent />
        <K label="MRR (plans)" v={formatMoney(mrr)} sub={`${tiers?.pro ?? 0} pro · ${tiers?.lm ?? 0} landmark`} />
        <K label="ARPPU" v={formatMoney(Number(paid?.n) ? Math.round(stats.totalSalesCents / Number(paid.n)) : 0)} sub={`${paid?.n ?? 0} paying users`} />
        <K label="Visits 7d" v={formatCount(visits7)} sub={`${formatCount(sum("uniques", 7))} uniques`} />
        <K label="Visit → checkout" v={`${visits7 ? ((checkout7 / visits7) * 100).toFixed(2) : "0"}%`} sub={`${checkout7} checkouts`} />
        <K label="Checkout → paid" v={`${checkout7 ? Math.min(100, (claims7 / checkout7) * 100).toFixed(0) : "0"}%`} sub={`${claims7} claims+takeovers`} />
        <K label="Users" v={formatCount(Number(users?.n ?? 0))} sub={`${owners?.n ?? 0} owners · ${sum("signups", 7)} new / 7d`} />
        <K label="Outbound clicks 7d" v={formatCount(sum("outboundClicks", 7))} sub="value delivered to owners" />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card title="Revenue per day (30d)"><Bars rows={series.map((r) => ({ day: r.day, value: r.revenueCents / 100 }))} /></Card>
        <Card title="Visits per day (30d)"><Bars rows={series.map((r) => ({ day: r.day, value: r.visits }))} color="#5ee6c3" /></Card>
        <Card title="Claims + takeovers per day"><Bars rows={series.map((r) => ({ day: r.day, value: r.claims + r.takeovers }))} color="#ff6b6b" /></Card>
        <Card title="Signups per day"><Bars rows={series.map((r) => ({ day: r.day, value: r.signups }))} color="#9b5de5" /></Card>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-[320px_1fr]">
        <Card title="Revenue by product">
          <table className="w-full text-sm"><tbody>{byKind.map((k) => <tr key={k.kind} className="border-t border-white/8"><td className="py-1.5 capitalize">{k.kind}</td><td className="mono py-1.5 text-right">{k.n}</td><td className="mono py-1.5 text-right text-amber-300">{formatMoney(Number(k.rev))}</td></tr>)}</tbody></table>
        </Card>
        <Card title="Latest transactions">
          <table className="w-full text-xs"><tbody>{recent.map((t) => <tr key={t.id} className="border-t border-white/8"><td className="py-1.5 capitalize">{t.kind}</td><td className="py-1.5">#{t.plotId}</td><td className="mono py-1.5">{t.provider}</td><td className="mono py-1.5 text-right">{formatMoney(t.amountCents)}</td><td className="py-1.5 text-right text-slate-500">{timeAgo(t.createdAt)}</td></tr>)}</tbody></table>
        </Card>
      </div>
    </Shell>
  );
}
function K({ label, v, sub, accent }: { label: string; v: string; sub?: string; accent?: boolean }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div><div className={`mono text-xl font-bold ${accent ? "text-amber-300" : ""}`}>{v}</div>{sub && <div className="text-[11px] text-slate-400">{sub}</div>}</div>;
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{title}</div>{children}</div>;
}
