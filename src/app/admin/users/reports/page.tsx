import { requireArea } from "@/lib/permissions-server";
import Reports from "@/components/admin/Reports";
export default async function Page() { await requireArea("users"); return <Reports />; }
