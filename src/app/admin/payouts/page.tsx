import Payouts from "@/components/admin/Payouts";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <Payouts initialStatus={sp.status ?? "pending"} />;
}
