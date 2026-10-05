import { notFound } from "next/navigation";
import { Shell } from "@/components/pages/Shell";
import { GAMES, type GameId } from "@/lib/arcade";
import { GameShell } from "@/components/arcade/GameShell";

export const dynamic = "force-dynamic";

export default async function GamePage({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  if (!GAMES[game as GameId]) notFound();
  const g = GAMES[game as GameId];
  return (
    <Shell wide>
      <GameShell gameId={game as GameId} name={g.name} blurb={g.blurb} cost={g.cost} prize={g.prize} prizeAt={g.prizeAt} />
    </Shell>
  );
}
