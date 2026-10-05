import Link from "next/link";
import { Shell } from "@/components/pages/Shell";
import { seasonHistory, SEASON_PRIZES } from "@/lib/seasons";
import { formatCount, formatMoney } from "@/lib/config";
import { weekId, weekBounds } from "@/lib/util";

export const metadata = { title: "Seasons" };
export const dynamic = "force-dynamic";

export default async function Seasons() {
  const history = await seasonHistory(12);
  const cur = weekId();
  const { endsAt } = weekBounds();
  const hoursLeft = Math.max(0, Math.round((endsAt - Date.now()) / 3_600_000));
  return (
    <Shell>
      <h1 className="text-3xl font-bold">Seasons</h1>
      <p className="text-sm text-slate-400">Every week is a season. Monday 00:00 UTC the trending board locks: the top 3 booths by visits win {SEASON_PRIZES.join(" / ")} coins and a week on the home page. Everyone's rank is snapshotted so your dashboard shows how you moved.</p>
      <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">Season {cur} · live</div>
        <p className="mt-1 text-sm">{hoursLeft} hours left. <Link href="/app/rankings?by=trending" className="underline">See the live trending board →</Link></p>
      </div>
      {history.length === 0 && <p className="mt-8 text-slate-400">The first season closes next Monday.</p>}
      <div className="mt-6 space-y-6">
        {history.map((s) => (
          <section key={s.id} className="rounded-2xl border border-white/10 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-bold">Season {s.id}</h2>
              <span className="text-xs text-slate-400">{formatCount(s.results.totals?.views ?? 0)} booth visits · {formatCount(s.results.totals?.clicks ?? 0)} clicks · {s.results.totals?.claims ?? 0} claims & takeovers</span>
            </div>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <Board title="Trending (views)" rows={s.results.trending ?? []} metric={(r) => `${formatCount(r.views)} views`} prizes />
              <Board title="Most clicked" rows={s.results.clicks ?? []} metric={(r) => `${formatCount(r.clicks)} clicks`} />
            </div>
          </section>
        ))}
      </div>
    </Shell>
  );
}

function Board({ title, rows, metric, prizes }: { title: string; rows: Array<{ boothId: number; name: string; views: number; clicks: number; valueCents: number }>; metric: (r: { views: number; clicks: number }) => string; prizes?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</div>
      <ol className="mt-1 divide-y divide-white/8">
        {rows.slice(0, 10).map((r, i) => (
          <li key={r.boothId}>
            <Link href={`/app/booth/${r.boothId}?src=seasons`} className="flex items-center gap-3 py-1.5 text-sm hover:bg-white/[0.03]">
              <span className={`mono w-6 ${i < 3 ? "text-amber-300 font-bold" : "text-slate-500"}`}>{i + 1}</span>
              <img src={`/api/logo/${r.boothId}`} alt="" className="h-7 w-7 rounded-md object-cover" />
              <span className="min-w-0 flex-1 truncate">{r.name} <span className="text-slate-500">#{r.boothId}</span></span>
              <span className="mono text-xs">{metric(r)}</span>
              {prizes && i < 3 && <span className="text-[10px] text-amber-300">+{SEASON_PRIZES[i]}c</span>}
              <span className="mono hidden text-xs text-slate-500 sm:block">{formatMoney(r.valueCents)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
