import Link from "next/link";
import { Shell } from "@/components/pages/Shell";
import { claimedBooths, TOTAL_BOOTHS } from "@/lib/economy";
import { CATEGORIES, formatMoney, BOOTH_SIZES, ZONES } from "@/lib/config";
import { hallLayout, describeSpace } from "@/lib/hall/layout";

export const metadata = { title: "Exhibitor directory" };
export const dynamic = "force-dynamic";

export default async function Directory({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const category = sp.category && CATEGORIES[sp.category] ? sp.category : "";
  const booths = await claimedBooths();
  const taken = new Set(booths.map((p) => p.id));
  const rows = booths.filter((p) => (!category || p.category === category) && (!q || p.name?.toLowerCase().includes(q) || p.tagline?.toLowerCase().includes(q) || p.label.toLowerCase() === q.replace("#", "")));
  const open = hallLayout().filter((b) => !taken.has(b.id));
  const available = [...open.filter((b) => b.zone === "headliner").slice(0, 6), ...open.filter((b) => b.zone === "front").slice(0, 6), ...open.filter((b) => b.zone === "standard").slice(0, 6), ...open.filter((b) => b.kind === "artist").slice(0, 6)];
  return (
    <Shell wide>
      <h1 className="text-3xl font-bold">Exhibitor directory</h1>
      <p className="text-sm text-slate-400">{booths.length} exhibitors · {TOTAL_BOOTHS - booths.length} spaces open</p>
      <form className="mt-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search names, taglines, booth numbers" className="input max-w-sm" />
        <select name="category" defaultValue={category} className="input max-w-[200px]"><option value="">All categories</option>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select>
        <button className="btn-primary">Search</button>
      </form>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map((p) => (
          <Link key={p.id} href={`/app/booth/${p.id}?src=directory`} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 hover:border-amber-300/50">
            <img src={`/api/logo/${p.id}`} alt="" className="h-14 w-14 rounded-xl bg-white/10 object-cover" />
            <span className="min-w-0">
              <span className="block truncate font-semibold">{p.name}</span>
              <span className="block truncate text-xs text-slate-400">{p.tagline ?? CATEGORIES[p.category]?.name}</span>
              <span className="mono mt-1 block text-xs text-amber-300">{p.kind === "artist" ? p.label : `Booth ${p.label}`} · Hall {p.hall} · {formatMoney(p.valueCents)}</span>
            </span>
          </Link>
        ))}
      </div>
      <h2 className="mt-10 text-xl font-bold">Open spaces</h2>
      <p className="text-sm text-slate-400">Pick a space and set up your booth. Artist Alley tables from {formatMoney(BOOTH_SIZES["6x10"].priceCents)}, 10×10 booths from {formatMoney(BOOTH_SIZES["10x10"].priceCents)}, islands from {formatMoney(BOOTH_SIZES["20x20"].priceCents)}.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {available.map((b) => (
          <Link key={b.id} href={`/app?booth=${b.id}`} className="rounded-xl border border-dashed border-white/15 p-3 hover:border-amber-300/60">
            <span className="mono block font-bold">{b.kind === "artist" ? b.label : `Booth ${b.label}`}</span>
            <span className="block text-[11px] text-slate-400">{BOOTH_SIZES[b.size].short} · {ZONES[b.zone].name}</span>
            <span className="block text-[10px] text-slate-500">{describeSpace(b)}</span>
            <span className="mono block text-xs text-amber-300">{formatMoney(b.priceCents)}</span>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
