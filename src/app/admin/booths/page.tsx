import { requireArea } from "@/lib/permissions-server";
import BoothsList from "@/components/admin/BoothsList";
export default async function Page() { await requireArea("booths");  return <BoothsList />; }
