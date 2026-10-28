import { requireArea } from "@/lib/permissions-server";
import Billboards from "@/components/admin/Billboards";
export default async function Page() { await requireArea("billboards");  return <Billboards />; }
