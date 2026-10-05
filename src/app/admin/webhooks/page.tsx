import Webhooks from "@/components/admin/Webhooks";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <Webhooks initialStatus={sp.status || ""} />;
}
