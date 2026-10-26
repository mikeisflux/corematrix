import Performance from "@/components/admin/Performance";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <Performance initialId={sp.id ?? null} />;
}
