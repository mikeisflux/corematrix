import { requireArea } from "@/lib/permissions-server";
import UsersList from "@/components/admin/UsersList";
export default async function Page() { await requireArea("users");  return <UsersList />; }
