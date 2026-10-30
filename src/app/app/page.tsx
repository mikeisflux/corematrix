import Link from "next/link";
import { preload } from "react-dom";
import { HallShell } from "@/components/hall/HallShell";
import { hallSnapshot } from "@/lib/hall-snapshot";
import manifest from "../../../public/models/manifest.json";
import { RefCapture } from "@/components/ui/RefCapture";
import { JsonLd } from "@/components/seo/JsonLd";
import { CATEGORIES, SITE_NAME } from "@/lib/config";
import { pageMeta, siteOrigin, graph, appLd, breadcrumbLd, PRICE_FROM } from "@/lib/seo";
import { LANDING_LINKS } from "@/lib/landings";

export const metadata = pageMeta({
  title: "The Show Floor: Walk a 3D Virtual Comic Con",
  description: "Enter the ForeverComicCon exhibit hall, a 3D virtual comic con in your browser. Walk the aisles, visit publisher and artist booths, play the arcade. Free.",
  path: "/app",
  image: { url: "/marketing/walk.jpg", width: 1600, height: 1000, alt: "Walking an aisle of booths toward the theater screen and the arcade" },
});

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [origin, snapshot] = await Promise.all([siteOrigin(), hallSnapshot()]);
  const booths = snapshot.booths;
  // Resource hints: the models and the lighting map start downloading with the JavaScript instead of after the scene
  // has mounted and asked for them, which took a manifest round trip plus the whole script parse first.
  for (const m of Object.values(manifest.models)) preload(m.file, { as: "fetch", crossOrigin: "anonymous" });
  preload("/hdri/warehouse.hdr", { as: "fetch", crossOrigin: "anonymous" });
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[var(--bg)]">
      <JsonLd data={graph(appLd(origin), breadcrumbLd(origin, [["Home", "/"], ["Show floor", "/app"]]))} />
      {/* The hall is a WebGL canvas, so screen readers (and anything else that can't see it) get this description of the
          floor instead, with links to everything on it. */}
      <section className="sr-only">
        <h1>{SITE_NAME} show floor: a 3D virtual comic convention</h1>
        <p>
          A 3D exhibit hall laid out like a real comic convention, open 24/7: Halls A to H of numbered booths, publisher islands,
          an Artists&apos; Alley, an arcade and a theater in the middle of the floor. Walk with the arrow keys or WASD, or the
          on-screen joystick on a phone. {booths.length} exhibitors are on the floor and {snapshot.stats.totalBooths - booths.length} spaces are open,
          from {PRICE_FROM}.
        </p>
        <h2>Exhibitors on the floor</h2>
        <ul>{booths.slice(0, 200).map((b) => <li key={b.id}><Link href={`/app/booth/${b.id}`}>{b.name ?? `Booth ${b.label}`}, {b.kind === "artist" ? "table" : "booth"} {b.label}, Hall {b.hall}</Link></li>)}</ul>
        <h2>Browse</h2>
        <ul>
          <li><Link href="/app/directory">Exhibitor directory</Link></li>
          {Object.entries(CATEGORIES).map(([k, c]) => <li key={k}><Link href={`/app/directory/${k}`}>{c.name} exhibitors</Link></li>)}
          <li><Link href="/app/arcade">Arcade</Link></li>
          <li><Link href="/app/rankings">Rankings</Link></li>
          <li><Link href="/app/how-it-works">How it works</Link></li>
          {LANDING_LINKS.map(([slug, label]) => <li key={slug}><Link href={`/${slug}`}>{label}</Link></li>)}
        </ul>
      </section>
      <HallShell clean={sp.clean === "1"} initial={snapshot} />
      <RefCapture />
    </main>
  );
}
