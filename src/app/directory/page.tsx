import Link from "next/link";
import { Shell } from "@/components/pages/Shell";
import { claimedPlots } from "@/lib/economy";
import { DISTRICTS, formatMoney, TOTAL_PLOTS, zoneFor, PRICE_PER_FLOOR_CENTS } from "@/lib/config";

export const metadata = { title: "Building directory" };
export const dynamic = "force-dynamic";

export default async function Directory({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const district = sp.district && DISTRICTS[sp.district] ? sp.district : "";
  const plots = await claimedPlots();
  const taken = new Set(plots.map((p) => p.id));
  const rows = plots.filter((p) => (!district || p.district === district) && (!q || p.name?.toLowerCase().includes(q) || p.tagline?.toLowerCase().includes(q) || String(p.id) === q.replace("#", "")));
  const available: number[] = [];
  for (let i = 1; i <= TOTAL_PLOTS && available.length < 24; i++) if (!taken.has(i)) available.push(i);
  return (
    <Shell wide>
      <h1 className="text-3xl font-bold">Building directory</h1>
      <p className="text-sm text-slate-400">{plots.length} buildings · {TOTAL_PLOTS - plots.length} plots available</p>
      <form className="mt-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search names, taglines, plot numbers" className="input max-w-sm" />
        <select name="district" defaultValue={district} className="input max-w-[200px]"><option value="">All districts</option>{Object.entries(DISTRICTS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select>
        <button className="btn-primary">Search</button>
      </form>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map((p) => (
          <Link key={p.id} href={`/plot/${p.id}?src=directory`} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 hover:border-amber-300/50">
            <img src={`/api/logo/${p.id}`} alt="" className="h-14 w-14 rounded-xl bg-white/10 object-cover" />
            <span className="min-w-0">
              <span className="block truncate font-semibold">{p.name}</span>
              <span className="block truncate text-xs text-slate-400">{p.tagline ?? DISTRICTS[p.district]?.name}</span>
              <span className="mono mt-1 block text-xs text-amber-300">#{p.id} · {formatMoney(p.valueCents)} · {p.floors} fl</span>
            </span>
          </Link>
        ))}
      </div>
      <h2 className="mt-10 text-xl font-bold">Available plots</h2>
      <p className="text-sm text-slate-400">Pick one and design your building. Price is {formatMoney(PRICE_PER_FLOOR_CENTS)} per floor.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {available.map((id) => {
          const z = zoneFor(id);
          return (
            <Link key={id} href={`/?plot=${id}`} className="rounded-xl border border-dashed border-white/15 p-3 hover:border-amber-300/60">
              <span className="mono block font-bold">Plot #{id}</span>
              <span className="block text-[11px] text-slate-400">{z.name}</span>
              <span className="mono block text-xs text-amber-300">from {formatMoney(z.minFloors * PRICE_PER_FLOOR_CENTS)}</span>
            </Link>
          );
        })}
      </div>
    </Shell>
  );
}
