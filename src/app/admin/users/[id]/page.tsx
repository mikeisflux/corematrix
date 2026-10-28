import { requireArea } from "@/lib/permissions-server";
import UserDetail from "@/components/admin/UserDetail";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { await requireArea("users");  const { id } = await params; return <UserDetail id={id} />; }
