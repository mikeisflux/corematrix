import BoothDetail from "@/components/admin/BoothDetail";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <BoothDetail id={id} />; }
