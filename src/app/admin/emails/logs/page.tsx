import { requireArea } from "@/lib/permissions-server";
import EmailLogs from "@/components/admin/EmailLogs";
export default async function Page() { await requireArea("emails");  return <EmailLogs />; }
