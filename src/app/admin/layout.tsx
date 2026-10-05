import { redirect } from "next/navigation";
import { requireAdmin, clientIp } from "@/lib/auth";
import { getSetting, siteName } from "@/lib/settings";
import AdminSidebar from "@/components/admin/Sidebar";
import "./admin.css";

export const metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  if (!admin) redirect("/app/login?next=/admin");
  const allow = (await getSetting("ADMIN_ALLOWED_IPS")).split(",").map((s) => s.trim()).filter(Boolean);
  if (allow.length) {
    const ip = await clientIp();
    if (!allow.includes(ip)) {
      return <div className="adm adm--forbidden"><div className="admForbidden"><div className="admLabel">403</div><h1 className="admH1">Forbidden</h1><p className="admMuted">Your address ({ip}) is not on the admin allow-list.</p></div></div>;
    }
  }
  return (
    <div className="adm">
      <AdminSidebar adminName={admin.displayName ?? admin.email} adminEmail={admin.email} siteName={await siteName()} />
      <main className="admMain">{children}</main>
    </div>
  );
}
