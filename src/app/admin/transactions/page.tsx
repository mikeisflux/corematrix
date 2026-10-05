import TransactionsList from "@/components/admin/TransactionsList";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) { const sp = await searchParams; return <TransactionsList initialStatus={sp.status || ""} />; }
