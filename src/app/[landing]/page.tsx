import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Nav } from "@/components/marketing/Nav";
import { Footer } from "@/components/marketing/Faq";
import { JsonLd } from "@/components/seo/JsonLd";
import { LANDINGS, type LandingSlug } from "@/lib/landings";
import { pageMeta, siteOrigin, graph, faqLd, breadcrumbLd, organizationLd, appLd } from "@/lib/seo";
import { CATEGORIES } from "@/lib/config";
import { Rich } from "@/components/ui/DocBlocks";
import "@/components/marketing/marketing.css";

export const dynamicParams = false;
export function generateStaticParams() { return Object.keys(LANDINGS).map((landing) => ({ landing })); }

const get = (slug: string) => (Object.hasOwn(LANDINGS, slug) ? LANDINGS[slug as LandingSlug] : null);

export async function generateMetadata({ params }: { params: Promise<{ landing: string }> }): Promise<Metadata> {
  const { landing } = await params;
  const l = get(landing);
  if (!l) return {};
  return pageMeta({
    title: l.title, absoluteTitle: true, description: l.description, path: `/${landing}`, keywords: l.keywords, type: "article",
    image: { url: l.image.src, width: 1600, height: 1000, alt: l.image.alt },
  });
}

export default async function LandingPage({ params }: { params: Promise<{ landing: string }> }) {
  const { landing } = await params;
  const l = get(landing);
  if (!l) notFound();
  const origin = await siteOrigin();
  const ld = graph(
    organizationLd(origin), appLd(origin),
    { "@type": "WebPage", "@id": `${origin}/${landing}#page`, url: `${origin}/${landing}`, name: l.title, description: l.description, isPartOf: { "@id": `${origin}/#website` }, about: { "@id": `${origin}/#app` }, primaryImageOfPage: `${origin}${l.image.src}`, inLanguage: "en" },
    faqLd(l.faq),
    breadcrumbLd(origin, [["Home", "/"], [l.eyebrow, `/${landing}`]]),
  );
  return (
    <div className="mk min-h-dvh">
      <JsonLd data={ld} />
      <Nav />
      <main>
        <article>
          <header className="relative z-10 mx-auto max-w-5xl px-5 pb-10 pt-14 text-center md:pt-24">
            <div className="mk-grid absolute inset-0 -z-10" aria-hidden />
            <nav aria-label="Breadcrumb" className="mb-5 text-xs text-slate-400"><Link href="/" className="hover:text-white">Home</Link> <span aria-hidden>›</span> <span className="text-slate-300">{l.eyebrow}</span></nav>
            <div className="mk-eyebrow">{l.eyebrow}</div>
            <h1 className="display mt-4 text-[36px] font-extrabold leading-[1.02] sm:text-5xl md:text-6xl">{l.h1}</h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-[var(--mk-muted)] md:text-xl">{l.lead}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href={l.cta.href} className="mk-btn mk-btn--primary">{l.cta.label}</Link>
              <Link href="/app?mode=walk" className="mk-btn mk-btn--ghost">Enter the hall</Link>
            </div>
            <p className="mt-5 text-sm text-slate-400"><a href="#steps" className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">Step-by-step guide with pictures ↓</a> · {l.steps.length} steps · {l.minutes}</p>
          </header>
          <figure className="relative z-10 mx-auto max-w-5xl px-5">
            <div className="mk-frame overflow-hidden rounded-3xl border border-white/10">
              <Image src={l.image.src} alt={l.image.alt} width={1600} height={1000} priority sizes="(max-width: 1100px) 100vw, 1024px" className="h-auto w-full" />
            </div>
          </figure>

          <div className="relative z-10 mx-auto max-w-3xl space-y-14 px-5 py-20">
            {/* the walkthrough: every step with what to press, what you will see, and a picture of it */}
            <section id="steps" className="scroll-mt-24">
              <div className="mk-eyebrow">Step by step</div>
              <h2 className="display mt-3 text-3xl font-extrabold leading-tight md:text-4xl">How to do it, screen by screen.</h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-300">Written for someone who has never used the site. Every step says exactly what to press and shows what you will see. {l.minutes}</p>
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Have ready before you start</h3>
                <ul className="mt-3 space-y-2">{l.before.map((b) => <li key={b} className="flex gap-3 text-slate-300"><span aria-hidden className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#ffcf5c]" /><span><Rich text={b} /></span></li>)}</ul>
              </div>
              <ol className="mt-10 space-y-14">
                {l.steps.map((st, i) => (
                  <li key={st.h} id={`step-${i + 1}`} className="scroll-mt-24">
                    <div className="flex items-start gap-4">
                      <span aria-hidden className="display mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#ffcf5c] text-lg font-extrabold text-slate-950">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <h3 className="display text-2xl font-extrabold leading-tight md:text-3xl"><span className="sr-only">Step {i + 1}: </span>{st.h}</h3>
                        {st.p.map((p) => <p key={p} className="mt-4 text-lg leading-relaxed text-slate-300"><Rich text={p} /></p>)}
                        {st.bullets && <ul className="mt-4 space-y-2.5">{st.bullets.map((b) => <li key={b} className="flex gap-3 text-slate-300"><span aria-hidden className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#ffcf5c]" /><span><Rich text={b} /></span></li>)}</ul>}
                        {st.img && (
                          <figure className="mt-6">
                            <div className="mk-frame overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                              <Image src={st.img.src} alt={st.img.alt} width={st.img.width} height={st.img.height} sizes="(max-width: 800px) 100vw, 768px" className="h-auto w-full" />
                            </div>
                            {st.img.caption && <figcaption className="mt-2 text-sm text-slate-400">{st.img.caption}</figcaption>}
                          </figure>
                        )}
                        {st.tip && <p className="mt-5 rounded-xl border border-[#ffcf5c]/30 bg-[#ffcf5c]/10 px-4 py-3 text-[15px] leading-relaxed text-slate-200">💡 <Rich text={st.tip} /></p>}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-slate-300">Every control, key, panel, price and limit is written up in the <Link href="/help" className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">help pages</Link>, and the same pages open inside the hall from the ❓ button.</p>
            </section>

            {l.sections.map((s) => (
              <section key={s.h}>
                <h2 className="display text-3xl font-extrabold leading-tight md:text-4xl">{s.h}</h2>
                {s.p.map((p) => <p key={p} className="mt-4 text-lg leading-relaxed text-slate-300">{p}</p>)}
                {s.bullets && <ul className="mt-5 space-y-2.5">{s.bullets.map((b) => <li key={b} className="flex gap-3 text-slate-300"><span aria-hidden className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#ffcf5c]" />{b}</li>)}</ul>}
              </section>
            ))}

            <section id="faq">
              <h2 className="display text-3xl font-extrabold leading-tight md:text-4xl">Questions</h2>
              <div className="mt-6 space-y-3">
                {l.faq.map(([q, a]) => (
                  <details key={q} className="mk-faq group rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <summary className="cursor-pointer list-none font-semibold text-white"><h3 className="inline text-base">{q}</h3></summary>
                    <p className="mt-3 leading-relaxed text-slate-300">{a}</p>
                  </details>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
              <h2 className="display text-3xl font-extrabold">The doors are open.</h2>
              <p className="mt-3 text-slate-300">Walking the floor is free. Booths start at five dollars.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link href={l.cta.href} className="mk-btn mk-btn--primary">{l.cta.label}</Link>
                <Link href="/app/directory" className="mk-btn mk-btn--ghost">Browse exhibitors</Link>
              </div>
            </section>

            <nav aria-label="More" className="grid gap-6 border-t border-white/10 pt-10 text-sm sm:grid-cols-2">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Keep reading</h2>
                <ul className="mt-3 space-y-2">
                  {l.related.map((slug) => { const r = LANDINGS[slug as LandingSlug]; return <li key={slug}><Link className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white" href={`/${slug}`}>{r.h1}</Link></li>; })}
                  <li><Link className="text-white underline decoration-white/30 underline-offset-4 hover:decoration-white" href="/app/how-it-works">How ForeverComicCon works</Link></li>
                </ul>
              </div>
              <div>
                <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Exhibitors by category</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(CATEGORIES).map(([k, c]) => <li key={k}><Link className="inline-block rounded-full border border-white/10 px-3 py-1 text-slate-300 hover:border-white/30 hover:text-white" href={`/app/directory/${k}`}>{c.name}</Link></li>)}
                </ul>
              </div>
            </nav>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
