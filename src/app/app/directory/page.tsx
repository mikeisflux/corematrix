import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta, siteOrigin, graph, itemListLd, breadcrumbLd } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { Shell } from "@/components/pages/Shell";
import { claimedBooths, TOTAL_BOOTHS } from "@/lib/economy";
import { CATEGORIES, formatMoney, BOOTH_SIZES, ZONES } from "@/lib/config";
import { hallLayout, describeSpace } from "@/lib/hall/layout";

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string>> }): Promise<Metadata> {
  const sp = await searchParams;
  return pageMeta({
    title: "Exhibitors: Comic Publishers, Artists and Shops",
    description: "Every exhibitor at ForeverComicCon, the virtual comic con: comic publishers, indie creators, artists, toy makers, game studios and shops, with booth links.",
    path: "/app/directory",
    // search results and filters are the same list re-cut: index the clean page and the category pages instead
    noindex: !!(sp.q || sp.category),
  });
}
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
      <JsonLd data={graph(itemListLd(await siteOrigin(), "ForeverComicCon exhibitors", booths.map((b) => ({ name: b.name ?? `Booth ${b.label}`, path: `/app/booth/${b.id}` }))), breadcrumbLd(await siteOrigin(), [["Home", "/"], ["Exhibitors", "/app/directory"]]))} />
      <h1 className="text-3xl font-bold">Exhibitor directory</h1>
      <p className="text-sm text-slate-400">{booths.length} exhibitors · {TOTAL_BOOTHS - booths.length} spaces open</p>
      <p className="mt-2 max-w-3xl text-slate-300">Everyone with a booth or table at the ForeverComicCon virtual comic con. Pick a category, search by name, or walk the floor and find them in 3D.</p>
      <nav aria-label="Categories" className="mt-3 flex flex-wrap gap-2 text-sm">
        {Object.entries(CATEGORIES).map(([k, v]) => <Link key={k} href={`/app/directory/${k}`} className="rounded-full border border-white/10 px-3 py-1 text-slate-300 hover:border-amber-300/50 hover:text-white">{v.name}</Link>)}
      </nav>
      <form className="mt-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search names, taglines, booth numbers" className="input max-w-sm" />
        <select name="category" defaultValue={category} className="input max-w-[200px]"><option value="">All categories</option>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select>
        <button className="btn-primary">Search</button>
      </form>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map((p) => (
          <Link key={p.id} href={`/app/booth/${p.id}?src=directory`} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 hover:border-amber-300/50">
            <img src={`/api/logo/${p.id}`} alt={`${p.name ?? "Exhibitor"} logo`} width={56} height={56} loading="lazy" className="h-14 w-14 rounded-xl bg-white/10 object-cover" />
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
