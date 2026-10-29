import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/pages/Shell";
import { JsonLd } from "@/components/seo/JsonLd";
import { claimedBooths } from "@/lib/economy";
import { CATEGORIES, formatMoney, BOOTH_SIZES } from "@/lib/config";
import { pageMeta, siteOrigin, graph, itemListLd, breadcrumbLd } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** What each category page is for, in the words people search with. */
const COPY: Record<string, { title: string; h1: string; intro: string; invite: string }> = {
  comics: {
    title: "Comic Publishers and Indie Comics at the Virtual Comic Con",
    h1: "Comic publishers and indie comics",
    intro: "Publishers big and small, indie creators, webcomics and back-issue dealers with booths on the ForeverComicCon floor. Click any booth to see their books and go straight to their store.",
    invite: "Publish comics? Put your books on the floor",
  },
  art: {
    title: "Comic Artists and Illustrators: Online Artist Alley",
    h1: "Comic artists and illustrators",
    intro: "Prints, commissions, sketch covers and original art from the artists at ForeverComicCon, many of them in the online Artists' Alley. Every table links to the artist's own shop or commissions page.",
    invite: "Draw? Get an Artists' Alley table",
  },
  toys: {
    title: "Toys, Figures and Collectibles Exhibitors",
    h1: "Toys and collectibles",
    intro: "Action figures, statues, vinyl, convention exclusives and the shops that sell them, exhibiting at the ForeverComicCon virtual comic con.",
    invite: "Make or sell collectibles? Take a booth",
  },
  games: {
    title: "Tabletop, Video Game and TCG Exhibitors",
    h1: "Games: tabletop, video games and TCGs",
    intro: "Board games, RPGs, trading card games and indie video games with booths on the ForeverComicCon show floor.",
    invite: "Making a game? Show it on the floor",
  },
  media: {
    title: "Film, TV, Streaming and Podcast Exhibitors",
    h1: "Film, TV and podcasts",
    intro: "Studios, streamers, animation, comic adaptations and podcasts exhibiting at the ForeverComicCon virtual comic con.",
    invite: "Have a show or a podcast? Get a booth",
  },
  retail: {
    title: "Comic Shops, Apparel and Merch Exhibitors",
    h1: "Comic shops, apparel and merch",
    intro: "Comic shops, clothing, pins, prints and merch stores with a permanent booth at ForeverComicCon. Visit the booth, then shop on their site.",
    invite: "Run a shop? Open a booth that never closes",
  },
  fan: {
    title: "Fan Clubs, Cosplay and Creator Communities",
    h1: "Fan clubs, cosplay and communities",
    intro: "Cosplayers, fan clubs, Discord communities, zines and creators building fandoms, exhibiting at the ForeverComicCon virtual comic con.",
    invite: "Run a community? Give it a booth",
  },
};

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const c = COPY[category];
  if (!c || !Object.hasOwn(CATEGORIES, category)) return {};
  return pageMeta({ title: c.title, description: c.intro.length <= 158 ? c.intro : `${c.intro.slice(0, 157).replace(/\s+\S*$/, "")}…`, path: `/app/directory/${category}` });
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const c = COPY[category];
  if (!c || !Object.hasOwn(CATEGORIES, category)) notFound();
  const booths = (await claimedBooths()).filter((b) => b.category === category).sort((a, b) => b.valueCents - a.valueCents);
  const origin = await siteOrigin();
  const name = CATEGORIES[category].name;
  return (
    <Shell wide>
      <JsonLd data={graph(
        { "@type": "CollectionPage", "@id": `${origin}/app/directory/${category}`, url: `${origin}/app/directory/${category}`, name: c.title, description: c.intro, isPartOf: { "@id": `${origin}/#website` } },
        itemListLd(origin, `${name} exhibitors at ForeverComicCon`, booths.map((b) => ({ name: b.name ?? `Booth ${b.label}`, path: `/app/booth/${b.id}` }))),
        breadcrumbLd(origin, [["Home", "/"], ["Exhibitors", "/app/directory"], [name, `/app/directory/${category}`]]),
      )} />
      <nav aria-label="Breadcrumb" className="text-xs text-slate-400"><Link href="/" className="hover:text-white">Home</Link> › <Link href="/app/directory" className="hover:text-white">Exhibitors</Link> › <span className="text-slate-300">{name}</span></nav>
      <h1 className="mt-2 text-3xl font-bold">{c.h1}</h1>
      <p className="mt-2 max-w-3xl text-slate-300">{c.intro}</p>
      <p className="mt-1 text-sm text-slate-400">{booths.length} {booths.length === 1 ? "exhibitor" : "exhibitors"} in {name}</p>

      {booths.length > 0 ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {booths.map((p) => (
            <li key={p.id}>
              <Link href={`/app/booth/${p.id}`} className="flex h-full gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 hover:border-amber-300/50">
                <img src={`/api/logo/${p.id}`} alt={`${p.name ?? "Exhibitor"} logo`} width={56} height={56} loading="lazy" className="h-14 w-14 rounded-xl bg-white/10 object-cover" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="block text-xs text-slate-400 line-clamp-2">{p.tagline ?? CATEGORIES[p.category]?.blurb}</span>
                  <span className="mono mt-1 block text-xs text-amber-300">{p.kind === "artist" ? `Table ${p.label}` : `Booth ${p.label}`} · Hall {p.hall}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 rounded-2xl border border-dashed border-white/15 p-6 text-slate-300">No {name.toLowerCase()} exhibitors yet. The first one gets the pick of the floor.</p>
      )}

      <section className="mt-10 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-6">
        <h2 className="text-xl font-bold">{c.invite}</h2>
        <p className="mt-1 text-slate-300">Artist Alley tables are {formatMoney(BOOTH_SIZES["6x10"].priceCents)} and booths start at {formatMoney(BOOTH_SIZES["10x10"].priceCents)}. Your booth stays on the floor 24/7, links to your site and shows you who stopped by.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/app?claim=1" className="btn-primary">Claim a booth</Link>
          <Link href="/exhibit" className="btn-ghost">How exhibiting works</Link>
        </div>
      </section>

      <nav aria-label="Other categories" className="mt-10">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">More exhibitors</h2>
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {Object.entries(CATEGORIES).filter(([k]) => k !== category).map(([k, v]) => <li key={k}><Link href={`/app/directory/${k}`} className="inline-block rounded-full border border-white/10 px-3 py-1 text-slate-300 hover:border-amber-300/50 hover:text-white">{v.name}</Link></li>)}
        </ul>
      </nav>
    </Shell>
  );
}
