import { requireArea } from "@/lib/permissions-server";
import Sentinel from "@/components/admin/Sentinel";
export default async function Page() { await requireArea("errors"); return <Sentinel />; }
