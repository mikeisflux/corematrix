import { requireArea } from "@/lib/permissions-server";
import BoothDetail from "@/components/admin/BoothDetail";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { await requireArea("booths");  const { id } = await params; return <BoothDetail id={id} />; }
