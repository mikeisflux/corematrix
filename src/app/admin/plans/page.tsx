import { requireArea } from "@/lib/permissions-server";
import Plans from "@/components/admin/Plans";
export default async function Page() { await requireArea("plans");  return <Plans />; }
