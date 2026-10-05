import Templates from "@/components/admin/Templates";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <Templates initialId={sp.id || null} />;
}
