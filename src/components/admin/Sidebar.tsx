"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { AdminArea } from "@/lib/permissions";

const NAV: { href: string; label: string; area?: AdminArea; sub?: { href: string; label: string }[] }[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/transactions", label: "Transactions", area: "transactions" },
  { href: "/admin/booths", label: "Booths", area: "booths" },
  { href: "/admin/users", label: "Users", area: "users" },
  { href: "/admin/plans", label: "Plans", area: "plans" },
  { href: "/admin/payouts", label: "Payouts", area: "payouts" },
  { href: "/admin/billboards", label: "Billboards", area: "billboards" },
  { href: "/admin/theater", label: "Theater", area: "theater" },
  { href: "/admin/emails", label: "Emails", area: "emails", sub: [
    { href: "/admin/emails", label: "Inbox" },
    { href: "/admin/emails/compose", label: "Compose" },
    { href: "/admin/emails/templates", label: "Templates" },
    { href: "/admin/emails/logs", label: "Logs" },
  ] },
  { href: "/admin/webhooks", label: "Webhooks", area: "webhooks" },
  { href: "/admin/performance", label: "Performance", area: "performance" },
  { href: "/admin/errors", label: "Sentinel", area: "errors" },
  { href: "/admin/audit", label: "Audit log", area: "audit" },
  { href: "/admin/settings", label: "Settings", area: "settings" },
];

export default function AdminSidebar({ adminName, adminEmail, siteName, areas, superadmin }: { adminName: string; adminEmail: string; siteName: string; areas: AdminArea[]; superadmin: boolean }) {
  const nav = NAV.filter((n) => !n.area || areas.includes(n.area));
  const path = usePathname() || "/admin";
  const [open, setOpen] = useState(false);
  const isOn = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/"));
  async function signOut() {
    try { await fetch("/api/auth/signout", { method: "POST" }); } catch { /* ignore */ }
    window.location.href = "/";
  }
  return (
    <aside className={`admSide${open ? " open" : ""}`}>
      <div className="admSide__hd">
        <Link href="/admin" className="admBrand">{siteName} <span>Admin</span></Link>
        <button className="admBtn admBtn--ghost admSide__toggle" onClick={() => setOpen((o) => !o)} aria-label="Menu">Menu</button>
      </div>
      <nav className="admNav" onClick={() => setOpen(false)}>
        {nav.map((n) => (
          <div key={n.href}>
            <Link href={n.href} className={`admNav__a${isOn(n.href) ? " on" : ""}`}>{n.label}</Link>
            {n.sub && isOn(n.href) && <div className="admNav__sub">{n.sub.map((s) => <Link key={s.href} href={s.href} className={`admNav__a${path === s.href ? " on" : ""}`}>{s.label}</Link>)}</div>}
          </div>
        ))}
      </nav>
      <div className="admSide__ft">
        <div className="admLabel" title={adminEmail}>{adminName}{!superadmin && <span className="admMuted"> · staff</span>}</div>
        <Link href="/app" className="admNav__a">View site</Link>
        <button className="admNav__a admNav__btn" onClick={signOut}>Sign out</button>
      </div>
    </aside>
  );
}
