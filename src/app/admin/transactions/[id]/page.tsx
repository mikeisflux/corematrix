import { requireArea } from "@/lib/permissions-server";
import TransactionDetail from "@/components/admin/TransactionDetail";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { await requireArea("transactions");  const { id } = await params; return <TransactionDetail id={id} />; }
