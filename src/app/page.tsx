import type { Metadata } from "next";
import { Nav } from "@/components/marketing/Nav";
import { Hero } from "@/components/marketing/Hero";
import { Pillars, Walk, Arcade, Marquee } from "@/components/marketing/Sections";
import { Pricing, Economy } from "@/components/marketing/Pricing";
import { Faq, Cta, Footer, QA } from "@/components/marketing/Faq";
import { JsonLd } from "@/components/seo/JsonLd";
import { pageMeta, siteOrigin, graph, organizationLd, websiteLd, appLd, faqLd, KEYWORDS, PRICE_FROM } from "@/lib/seo";
import { Reveal, PointerGlow } from "@/components/marketing/Fx";
import { siteStats, TOTAL_BOOTHS } from "@/lib/economy";
import { onlineCount } from "@/lib/realtime";
import { SITE_NAME } from "@/lib/config";
import "@/components/marketing/marketing.css";

export const revalidate = 60;
export const metadata: Metadata = pageMeta({
  title: `${SITE_NAME}: Virtual Comic Con Open 24/7 | 3D Online Comic Convention`,
  absoluteTitle: true,
  description: `Walk a 3D virtual comic con in your browser, free and open 24/7. Comic publishers, indie creators, artists and shops own booths from ${PRICE_FROM}.`,
  path: "/",
  keywords: KEYWORDS,
  image: { url: "/marketing/og.jpg", width: 1200, height: 630, alt: "The ForeverComicCon show floor: the premier island with the arcade behind it" },
});

export default async function Landing() {
  const s = await siteStats().catch(() => ({ claimed: 0, totalViews: 0, totalSalesCents: 0 }));
  const stats = { claimed: s.claimed, totalBooths: TOTAL_BOOTHS, totalViews: s.totalViews, totalSalesCents: s.totalSalesCents, online: Math.max(1, onlineCount()) };
  const origin = await siteOrigin();
  return (
    <div className="mk min-h-dvh">
      <JsonLd data={graph(organizationLd(origin), websiteLd(origin), appLd(origin), faqLd(QA))} />
      <PointerGlow />
      <Nav />
      <main>
        <Hero stats={stats} />
        <Marquee />
        <Pillars />
        <Walk />
        <Pricing />
        <Economy />
        <Arcade />
        <Faq />
        <Cta />
      </main>
      <Footer />
      <Reveal />
    </div>
  );
}
