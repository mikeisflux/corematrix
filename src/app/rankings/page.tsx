import Link from "next/link";
import { Shell } from "@/components/pages/Shell";
import { claimedPlots } from "@/lib/economy";
import { trendingScores } from "@/lib/analytics";
import { DISTRICTS, formatCount, formatMoney } from "@/lib/config";
import { weekId } from "@/lib/util";

export const metadata = { title: "Rankings" };
export const dynamic = "force-dynamic";

const TABS: Record<string, string> = { value: "Most valuable", trending: "Trending this week", visits: "Most visited", clicks: "Most clicked", tallest: "Tallest", newest: "Newest" };

export default async function Rankings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const tab = TABS[sp.by] ? sp.by : "value";
  const district = sp.district && DISTRICTS[sp.district] ? sp.district : "";
  const [plots, trend] = await Promise.all([claimedPlots(), trendingScores(7)]);
  const rows = plots
    .filter((p) => !district || p.district === district)
    .map((p) => ({ ...p, v7: trend.get(p.id)?.views ?? 0, c7: trend.get(p.id)?.clicks ?? 0 }))
    .sort((a, b) => (tab === "trending" ? b.v7 - a.v7 : tab === "visits" ? b.totalViews - a.totalViews : tab === "clicks" ? b.totalClicks - a.totalClicks : tab === "tallest" ? b.floors - a.floors : tab === "newest" ? (b.claimedAt ?? 0) - (a.claimedAt ?? 0) : b.valueCents - a.valueCents))
    .slice(0, 100);
  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Rankings</h1>
          <p className="text-sm text-slate-400">Season {weekId()} · trending resets every Monday 00:00 UTC. Top 3 trending buildings get featured on the home page all week.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1">
        {Object.entries(TABS).map(([k, v]) => <Link key={k} href={`/rankings?by=${k}${district ? `&district=${district}` : ""}`} className={`rounded-lg px-3 py-1.5 text-sm ${tab === k ? "bg-amber-300 text-slate-950 font-semibold" : "bg-white/5 hover:bg-white/10"}`}>{v}</Link>)}
      </div>
      <div className="mt-2 flex flex-wrap gap-1 text-xs">
        <Link href={`/rankings?by=${tab}`} className={`rounded-lg px-2 py-1 ${!district ? "bg-white/15" : "bg-white/5"}`}>All districts</Link>
        {Object.entries(DISTRICTS).map(([k, v]) => <Link key={k} href={`/rankings?by=${tab}&district=${k}`} className={`rounded-lg px-2 py-1 ${district === k ? "bg-white/15" : "bg-white/5"}`}>{v.name}</Link>)}
      </div>
      <ol className="mt-6 divide-y divide-white/8 rounded-2xl border border-white/10">
        {rows.map((p, i) => (
          <li key={p.id}>
            <Link href={`/plot/${p.id}?src=rankings`} className="flex items-center gap-4 px-4 py-3 hover:bg-white/[0.04]">
              <span className={`mono w-8 text-lg ${i < 3 ? "font-bold text-amber-300" : "text-slate-500"}`}>{i + 1}</span>
              <img src={`/api/logo/${p.id}`} alt="" className="h-11 w-11 rounded-xl bg-white/10 object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.name}</span>
                <span className="block truncate text-xs text-slate-400">Plot #{p.id} · {DISTRICTS[p.district]?.name} · {p.floors} floors · {formatCount(p.totalViews)} visits · {formatCount(p.totalClicks)} clicks</span>
              </span>
              <span className="mono text-right text-sm">
                <span className="block text-amber-300">{tab === "trending" ? `${formatCount(p.v7)} views / 7d` : tab === "visits" ? formatCount(p.totalViews) : tab === "clicks" ? formatCount(p.totalClicks) : tab === "tallest" ? `${p.floors} fl` : formatMoney(p.valueCents)}</span>
                {tab !== "value" && <span className="block text-xs text-slate-500">{formatMoney(p.valueCents)}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Shell>
  );
}
