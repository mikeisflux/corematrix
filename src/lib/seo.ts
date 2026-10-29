/**
 * Search: the public origin, page metadata and schema.org structured data.
 *
 * Every canonical link, sitemap entry and share image is built from `siteOrigin()`. It prefers the admin SITE_URL
 * setting, then NEXT_PUBLIC_SITE_URL, and in production never falls back to localhost: a build made with the example
 * .env would otherwise tell Google that every page lives on http://localhost:3000.
 */
import type { Metadata } from "next";
import { getSetting } from "@/lib/settings";
import { SITE_NAME, BOOTH_SIZES, formatMoney } from "@/lib/config";

export const PRODUCTION_ORIGIN = "https://forevercomiccon.com";
const isLocal = (u: string) => /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(u);

export async function siteOrigin(): Promise<string> {
  const candidates = [await getSetting("SITE_URL").catch(() => ""), process.env.NEXT_PUBLIC_SITE_URL ?? ""];
  for (const c of candidates) {
    const v = c.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(v)) continue;
    if (isLocal(v) && process.env.NODE_ENV === "production") continue;
    return v;
  }
  return process.env.NODE_ENV === "production" ? PRODUCTION_ORIGIN : "http://localhost:3000";
}

/** The searches the site is built to answer; the landing pages and descriptions use the same words. */
export const KEYWORDS = [
  "virtual comic con", "online comic convention", "virtual comic convention", "comic con online", "3D comic convention",
  "online artist alley", "virtual artist alley", "comic convention booth", "virtual convention booth", "virtual exhibit hall",
  "promote indie comics", "indie comic marketing", "comic book publishers", "webcomic promotion", "comic creators",
];

export const DEFAULT_OG = { url: "/marketing/og.jpg", width: 1200, height: 630, alt: `The ${SITE_NAME} show floor: a 3D virtual comic convention open 24/7` };
const cheapest = formatMoney(Math.min(...Object.values(BOOTH_SIZES).map((s) => s.priceCents)));
export const PRICE_FROM = cheapest;

interface PageMetaInput {
  title: string;            // page title; the layout template adds " · ForeverComicCon" unless absolute
  description: string;
  path: string;             // canonical path, e.g. "/app/directory"
  absoluteTitle?: boolean;
  image?: { url: string; width?: number; height?: number; alt?: string } | null;
  noindex?: boolean;
  type?: "website" | "article" | "profile";
  keywords?: string[];
}

/** Title, description, canonical, Open Graph and Twitter card in one go, so no page ships half its tags. */
export function pageMeta(m: PageMetaInput): Metadata {
  const image = m.image === null ? undefined : m.image ?? DEFAULT_OG;
  const fullTitle = m.absoluteTitle ? m.title : `${m.title} · ${SITE_NAME}`;
  return {
    title: m.absoluteTitle ? { absolute: m.title } : m.title,
    description: m.description,
    keywords: m.keywords,
    alternates: { canonical: m.path },
    robots: m.noindex ? { index: false, follow: true } : undefined,
    openGraph: { title: fullTitle, description: m.description, url: m.path, siteName: SITE_NAME, type: m.type ?? "website", locale: "en_US", images: image ? [image] : undefined },
    twitter: { card: "summary_large_image", title: fullTitle, description: m.description, images: image ? [image.url] : undefined },
  };
}

/** Pages nobody should land on from a search: dashboards, checkout, one-time links. */
export const PRIVATE: Metadata = { robots: { index: false, follow: false } };

/* ---------- schema.org ---------- */

type Json = Record<string, unknown>;
const abs = (origin: string, p: string) => (/^https?:/.test(p) ? p : `${origin}${p.startsWith("/") ? "" : "/"}${p}`);

export function organizationLd(origin: string): Json {
  return {
    "@type": "Organization", "@id": `${origin}/#org`, name: SITE_NAME, url: origin,
    logo: { "@type": "ImageObject", url: `${origin}/icon-512.png`, width: 512, height: 512 },
    description: "A 3D virtual comic convention open 24/7, where publishers, artists and shops own booths on a show floor laid out like a real con.",
  };
}

export function websiteLd(origin: string): Json {
  return {
    "@type": "WebSite", "@id": `${origin}/#website`, name: SITE_NAME, alternateName: ["Forever Comic Con", "ForeverComicCon virtual comic con"], url: origin,
    publisher: { "@id": `${origin}/#org` }, inLanguage: "en",
    potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${origin}/app/directory?q={search_term_string}` }, "query-input": "required name=search_term_string" },
  };
}

/** The show floor as a browser app with booth prices as offers. */
export function appLd(origin: string): Json {
  return {
    "@type": "WebApplication", "@id": `${origin}/#app`, name: `${SITE_NAME} show floor`, url: `${origin}/app`,
    applicationCategory: "EntertainmentApplication", operatingSystem: "Any (web browser)", browserRequirements: "Requires WebGL",
    description: "Walk a 3D comic convention exhibit hall in your browser: publisher islands, inline booths, an artist alley, an arcade and a theater.",
    image: abs(origin, DEFAULT_OG.url),
    offers: {
      "@type": "AggregateOffer", priceCurrency: "USD", lowPrice: (Math.min(...Object.values(BOOTH_SIZES).map((s) => s.priceCents)) / 100).toFixed(2),
      highPrice: (Math.max(...Object.values(BOOTH_SIZES).map((s) => s.priceCents)) / 100).toFixed(2), offerCount: Object.keys(BOOTH_SIZES).length,
      url: `${origin}/exhibit`,
    },
    publisher: { "@id": `${origin}/#org` },
  };
}

export function faqLd(qa: ReadonlyArray<readonly [string, string]>): Json {
  return { "@type": "FAQPage", mainEntity: qa.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
}

export function breadcrumbLd(origin: string, items: Array<[string, string]>): Json {
  return { "@type": "BreadcrumbList", itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(origin, path) })) };
}

export function itemListLd(origin: string, name: string, items: Array<{ name: string; path: string }>): Json {
  return { "@type": "ItemList", name, numberOfItems: items.length, itemListElement: items.slice(0, 100).map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, url: abs(origin, it.path) })) };
}

/** Wraps nodes in one @graph document; render it with <JsonLd>. */
export function graph(...nodes: Json[]): Json {
  return { "@context": "https://schema.org", "@graph": nodes };
}

/** Serialised for a <script type="application/ld+json">, with "<" escaped so exhibitor text can't close the tag. */
export function ldString(doc: Json): string {
  return JSON.stringify(doc).replace(/</g, "\\u003c");
}
