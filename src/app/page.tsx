import { CityShell } from "@/components/city/CityShell";
import { RefCapture } from "@/components/ui/RefCapture";

export default function Home() {
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[var(--bg)]">
      <CityShell />
      <RefCapture />
    </main>
  );
}
