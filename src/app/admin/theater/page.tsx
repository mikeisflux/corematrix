import { requireArea } from "@/lib/permissions-server";
import Theater from "@/components/admin/Theater";
export default async function Page() { await requireArea("theater");  return <Theater />; }
