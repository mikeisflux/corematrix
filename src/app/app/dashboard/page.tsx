import { redirect } from "next/navigation";
import { Shell } from "@/components/pages/Shell";
import { currentUser } from "@/lib/auth";
import { Dashboard } from "@/components/pages/Dashboard";
import { PRIVATE } from "@/lib/seo";

export const metadata = { title: "Dashboard", ...PRIVATE };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await currentUser();
  if (!user) redirect("/app/login?next=/app/dashboard");
  const sp = await searchParams;
  return (
    <Shell wide>
      <Dashboard initialBooth={sp.booth ? Number(sp.booth) : null} />
    </Shell>
  );
}
