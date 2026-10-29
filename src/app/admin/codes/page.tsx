import { requireArea } from "@/lib/permissions-server";
import Codes from "@/components/admin/Codes";
export default async function Page() { await requireArea("codes"); return <Codes />; }
