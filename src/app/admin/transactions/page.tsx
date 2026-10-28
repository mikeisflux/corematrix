import { requireArea } from "@/lib/permissions-server";
import TransactionsList from "@/components/admin/TransactionsList";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) { await requireArea("transactions");  const sp = await searchParams; return <TransactionsList initialStatus={sp.status || ""} />; }
