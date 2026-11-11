import { Shell } from "@/components/pages/Shell";
import { Slots } from "@/components/arcade/Slots";
import { SLOT_RTP } from "@/lib/slots-table";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Lucky Longbox Slots: Bet Your Coins in the Virtual Comic Con Arcade",
  description: "A three-reel slot machine in the ForeverComicCon arcade. Bet 1 to 25 coins a spin; three sevens pay 150 times the bet.",
  path: "/app/arcade/slots",
  image: { url: "/marketing/arcade-night.jpg", width: 1600, height: 1000, alt: "The neon arcade on the ForeverComicCon show floor" },
});
export const dynamic = "force-dynamic";

export default function SlotsPage() {
  return (
    <Shell wide>
      <Slots rtp={SLOT_RTP} />
    </Shell>
  );
}
