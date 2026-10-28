import { requireArea } from "@/lib/permissions-server";
import Performance from "@/components/admin/Performance";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) { await requireArea("performance"); 
  const sp = await searchParams;
  return <Performance initialId={sp.id ?? null} />;
}
