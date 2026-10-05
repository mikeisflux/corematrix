import type { Metadata } from "next";
import { Nav } from "@/components/marketing/Nav";
import { Hero } from "@/components/marketing/Hero";
import { Pillars, Walk, Arcade, Marquee } from "@/components/marketing/Sections";
import { Pricing, Economy } from "@/components/marketing/Pricing";
import { Faq, Cta, Footer } from "@/components/marketing/Faq";
import { Reveal, PointerGlow } from "@/components/marketing/Fx";
import { siteStats, TOTAL_BOOTHS } from "@/lib/economy";
import { onlineCount } from "@/lib/realtime";
import { SITE_NAME } from "@/lib/config";
import "@/components/marketing/marketing.css";

export const revalidate = 60;
export const metadata: Metadata = {
  title: `${SITE_NAME} — the comic convention that never closes`,
  description: "A 3D exhibit hall laid out like a real convention floor, open 24/7. Publishers, artists and shops own booths from $5. Fans pick an avatar and walk the floor.",
  openGraph: { images: ["/marketing/hero.jpg"] },
};

export default async function Landing() {
  const s = await siteStats().catch(() => ({ claimed: 0, totalViews: 0, totalSalesCents: 0 }));
  const stats = { claimed: s.claimed, totalBooths: TOTAL_BOOTHS, totalViews: s.totalViews, totalSalesCents: s.totalSalesCents, online: Math.max(1, onlineCount()) };
  return (
    <div className="mk min-h-dvh">
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
