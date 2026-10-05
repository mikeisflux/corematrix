import { HallShell } from "@/components/hall/HallShell";
import { RefCapture } from "@/components/ui/RefCapture";

export default function Home() {
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[var(--bg)]">
      <HallShell />
      <RefCapture />
    </main>
  );
}
