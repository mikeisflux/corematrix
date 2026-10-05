import { HallShell } from "@/components/hall/HallShell";
import { RefCapture } from "@/components/ui/RefCapture";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[var(--bg)]">
      <HallShell clean={sp.clean === "1"} />
      <RefCapture />
    </main>
  );
}
