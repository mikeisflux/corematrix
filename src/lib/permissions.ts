/**
 * Admin areas. A superadmin (users.is_admin) can do everything; any other
 * account can be given a list of areas and then sees and uses only those
 * parts of /admin. Shared by the API guard, the admin layout and the UI.
 */
export const ADMIN_AREAS = [
  { id: "transactions", label: "Transactions", blurb: "Checkouts, refunds, disputes" },
  { id: "booths", label: "Booths", blurb: "Every booth: edit, hide, release, transfer" },
  { id: "users", label: "Users", blurb: "Accounts, credit, coins, passwords (permissions stay with superadmins)" },
  { id: "plans", label: "Plans", blurb: "Subscriptions and tiers" },
  { id: "codes", label: "Booth codes", blurb: "Generate and track codes that pay for a booth" },
  { id: "payouts", label: "Payouts", blurb: "Money owed to sellers" },
  { id: "billboards", label: "Billboards", blurb: "Hall advertising" },
  { id: "theater", label: "Theater", blurb: "Films, uploads and the playlist" },
  { id: "emails", label: "Emails", blurb: "Inbox, compose, templates, logs" },
  { id: "webhooks", label: "Webhooks", blurb: "Payment events and reprocessing" },
  { id: "performance", label: "Performance", blurb: "Frame-rate captures" },
  { id: "audit", label: "Audit log", blurb: "Who changed what" },
  { id: "errors", label: "Sentinel", blurb: "Browser and server errors, grouped, with stacks" },
  { id: "settings", label: "Settings", blurb: "Site configuration and integrations" },
] as const;
export type AdminArea = (typeof ADMIN_AREAS)[number]["id"];
export const isAdminArea = (s: unknown): s is AdminArea => typeof s === "string" && ADMIN_AREAS.some((a) => a.id === s);

/** The areas stored on a user row (JSON array), tolerant of junk. */
export function parsePermissions(raw: string | null | undefined): AdminArea[] {
  try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v.filter(isAdminArea) : []; } catch { return []; }
}
/** Superadmins hold every area; everyone else only what they were given. */
export function areasOf(u: { isAdmin: boolean; permissions?: string | null }): AdminArea[] {
  return u.isAdmin ? ADMIN_AREAS.map((a) => a.id) : parsePermissions(u.permissions);
}
export const canAccess = (u: { isAdmin: boolean; permissions?: string | null }, area: AdminArea) => u.isAdmin || parsePermissions(u.permissions).includes(area);
