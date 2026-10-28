import { requireArea } from "@/lib/permissions-server";
import Settings from "@/components/admin/Settings";
export default async function Page() { await requireArea("settings");  return <Settings />; }
