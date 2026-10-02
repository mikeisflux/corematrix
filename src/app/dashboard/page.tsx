import { redirect } from "next/navigation";
import { Shell } from "@/components/pages/Shell";
import { currentUser } from "@/lib/auth";
import { Dashboard } from "@/components/pages/Dashboard";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard");
  const sp = await searchParams;
  return (
    <Shell wide>
      <Dashboard initialPlot={sp.plot ? Number(sp.plot) : null} />
    </Shell>
  );
}
