import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { notFound } from "next/navigation";
import { Shell } from "@/components/pages/Shell";
import { GAMES, type GameId } from "@/lib/arcade";
import { GameShell } from "@/components/arcade/GameShell";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }): Promise<Metadata> {
  const { game } = await params;
  if (!Object.hasOwn(GAMES, game)) return {};
  const g = GAMES[game as GameId];
  return pageMeta({
    title: `${g.name}: Play in the Virtual Comic Con Arcade`,
    description: `${g.blurb} Play ${g.name} in your browser at the ForeverComicCon arcade. Score ${g.prizeAt.toLocaleString()} to win ${g.prize} coins.`,
    path: `/app/arcade/${game}`,
    image: { url: "/marketing/arcade-night.jpg", width: 1600, height: 1000, alt: "The neon arcade on the ForeverComicCon show floor" },
  });
}

export default async function GamePage({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  if (!Object.hasOwn(GAMES, game)) notFound(); // not a plain lookup: "constructor" would pass
  const g = GAMES[game as GameId];
  return (
    <Shell wide>
      <GameShell gameId={game as GameId} name={g.name} blurb={g.blurb} cost={g.cost} prize={g.prize} prizeAt={g.prizeAt} />
    </Shell>
  );
}
