"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV: { href: string; label: string; sub?: { href: string; label: string }[] }[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/transactions", label: "Transactions" },
  { href: "/admin/booths", label: "Booths" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/plans", label: "Plans" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/billboards", label: "Billboards" },
  { href: "/admin/emails", label: "Emails", sub: [
    { href: "/admin/emails", label: "Inbox" },
    { href: "/admin/emails/compose", label: "Compose" },
    { href: "/admin/emails/templates", label: "Templates" },
    { href: "/admin/emails/logs", label: "Logs" },
  ] },
  { href: "/admin/webhooks", label: "Webhooks" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminSidebar({ adminName, adminEmail, siteName }: { adminName: string; adminEmail: string; siteName: string }) {
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
        {NAV.map((n) => (
          <div key={n.href}>
            <Link href={n.href} className={`admNav__a${isOn(n.href) ? " on" : ""}`}>{n.label}</Link>
            {n.sub && isOn(n.href) && <div className="admNav__sub">{n.sub.map((s) => <Link key={s.href} href={s.href} className={`admNav__a${path === s.href ? " on" : ""}`}>{s.label}</Link>)}</div>}
          </div>
        ))}
      </nav>
      <div className="admSide__ft">
        <div className="admLabel" title={adminEmail}>{adminName}</div>
        <Link href="/app" className="admNav__a">View site</Link>
        <button className="admNav__a admNav__btn" onClick={signOut}>Sign out</button>
      </div>
    </aside>
  );
}
