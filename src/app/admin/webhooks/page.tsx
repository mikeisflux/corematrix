import { requireArea } from "@/lib/permissions-server";
import Webhooks from "@/components/admin/Webhooks";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) { await requireArea("webhooks"); 
  const sp = await searchParams;
  return <Webhooks initialStatus={sp.status || ""} />;
}
