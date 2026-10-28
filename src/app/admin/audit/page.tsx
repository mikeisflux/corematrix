import { requireArea } from "@/lib/permissions-server";
import AuditLog from "@/components/admin/AuditLog";
export default async function Page() { await requireArea("audit");  return <AuditLog />; }
