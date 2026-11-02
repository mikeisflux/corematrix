import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/pages/Shell";
import { DOCS, docBySlug } from "@/lib/docs";
import { DocBlocks } from "@/components/ui/DocBlocks";
import { JsonLd } from "@/components/seo/JsonLd";
import { pageMeta, siteOrigin, graph, breadcrumbLd } from "@/lib/seo";
import { SITE_NAME } from "@/lib/config";

export const revalidate = 3600;
export function generateStaticParams() { return DOCS.map((d) => ({ slug: d.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const d = docBySlug(slug);
  if (!d) return pageMeta({ title: "Help", description: `The ${SITE_NAME} guide.`, path: "/help", noindex: true });
  return pageMeta({ title: `${d.title}: ${SITE_NAME} Guide`, description: d.summary, path: `/help/${d.slug}` });
}

export default async function HelpSection({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = docBySlug(slug);
  if (!d) notFound();
  const origin = await siteOrigin();
  const i = DOCS.indexOf(d), prev = DOCS[i - 1], next = DOCS[i + 1];
  return (
    <Shell>
      <JsonLd data={graph(breadcrumbLd(origin, [["Home", "/"], ["Help", "/help"], [d.title, `/help/${d.slug}`]]), { "@type": "TechArticle", headline: d.title, description: d.summary, url: `${origin}/help/${d.slug}` })} />
      <div className="mx-auto max-w-3xl">
        <Link href="/help" className="text-xs text-slate-400 hover:text-white">← The whole guide</Link>
        <div className="mt-2 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">{d.audience === "everyone" ? "For everyone" : `For ${d.audience}`}</div>
        <h1 className="mt-1 text-3xl font-bold"><span className="mr-2">{d.icon}</span>{d.title}</h1>
        <p className="mt-2 text-lg text-slate-300">{d.summary}</p>
        <div className="mt-6"><DocBlocks blocks={d.blocks} /></div>
        <div className="mt-10 flex justify-between gap-3 border-t border-white/10 pt-4 text-sm">
          {prev ? <Link href={`/help/${prev.slug}`} className="text-slate-300 hover:text-white">← {prev.title}</Link> : <span />}
          {next ? <Link href={`/help/${next.slug}`} className="text-slate-300 hover:text-white">{next.title} →</Link> : <span />}
        </div>
      </div>
    </Shell>
  );
}
