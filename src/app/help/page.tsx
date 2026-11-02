import Link from "next/link";
import { Shell } from "@/components/pages/Shell";
import { DOCS } from "@/lib/docs";
import { DocBlocks } from "@/components/ui/DocBlocks";
import { JsonLd } from "@/components/seo/JsonLd";
import { pageMeta, siteOrigin, graph, breadcrumbLd } from "@/lib/seo";
import { SITE_NAME } from "@/lib/config";

export const metadata = pageMeta({
  title: "Help and Guide: Every Feature of the Virtual Comic Con",
  description: `How ${SITE_NAME} works, in full: walking the floor, booths and claiming, the dashboard, analytics, coins and quests, the arcade and theater, avatars and the shop, chat, tours, voice and more.`,
  path: "/help",
});

// rendered per request: prerendering sixteen pages at once locked the SQLite file the site origin is read from
export const dynamic = "force-dynamic";

/** The whole guide on one page, with a section index; each section also has its own page at /help/<slug>. */
export default async function HelpPage() {
  const origin = await siteOrigin();
  return (
    <Shell>
      <JsonLd data={graph(breadcrumbLd(origin, [["Home", "/"], ["Help", "/help"]]), { "@type": "TechArticle", headline: `${SITE_NAME} guide`, url: `${origin}/help`, about: DOCS.map((d) => d.title) })} />
      <div className="grid gap-8 md:grid-cols-[240px_1fr]">
        <aside className="md:sticky md:top-20 md:self-start">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">Guide</div>
          <h1 className="mt-1 text-2xl font-bold">How {SITE_NAME} works</h1>
          <p className="mt-1 text-sm text-slate-400">Every feature, what it does and how to use it. The same guide is in the hall under ❓ Help.</p>
          <nav className="mt-4 space-y-0.5 text-sm">
            {DOCS.map((d) => <a key={d.slug} href={`#${d.slug}`} className="flex items-center gap-2 rounded-lg px-2 py-1 text-slate-300 hover:bg-white/5 hover:text-white"><span>{d.icon}</span>{d.title}</a>)}
          </nav>
        </aside>
        <div className="space-y-12">
          {DOCS.map((d) => (
            <section key={d.slug} id={d.slug} className="scroll-mt-24">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-2xl font-bold"><span className="mr-2">{d.icon}</span>{d.title}</h2>
                <Link href={`/help/${d.slug}`} className="shrink-0 text-xs text-slate-400 hover:text-white">own page →</Link>
              </div>
              <p className="mt-1 text-slate-400">{d.summary}</p>
              <div className="mt-4"><DocBlocks blocks={d.blocks} /></div>
            </section>
          ))}
        </div>
      </div>
    </Shell>
  );
}
