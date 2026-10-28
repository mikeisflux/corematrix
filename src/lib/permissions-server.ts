import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { canAccess, type AdminArea } from "@/lib/permissions";

/** Page-level check for /admin/<area>: anyone with admin access gets in, but only to the areas on their account. */
export async function requireArea(area: AdminArea) {
  const u = await requireAdmin();
  if (!u) redirect(`/app/login?next=/admin/${area}`);
  if (!canAccess(u, area)) redirect("/admin?denied=" + area);
  return u;
}
