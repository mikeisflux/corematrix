/* Admin-managed settings stored in SQL, with .env fallback.
   Everything an operator needs to configure lives in /admin/settings.
   Same pattern as the Play Time admin: add new keys to SETTING_KEYS so they
   appear in the panel. */
import { eq } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";

export interface SettingDef {
  key: string;
  label: string;
  group: string;
  hint?: string;
  secret?: boolean;
  readonly?: boolean; // computed / informational rows
}

export const SETTING_GROUPS = ["Site", "DivinityCoin", "SendGrid", "Economy", "Security"] as const;

export const SETTING_KEYS: SettingDef[] = [
  // Site
  { key: "SITE_URL", label: "Public site URL", group: "Site", hint: "https://forevercomiccon.com" },
  { key: "SITE_NAME", label: "Site name", group: "Site", hint: "ForeverComicCon" },
  { key: "SUPPORT_EMAIL", label: "Support email", group: "Site", hint: "hello@forevercomiccon.com" },
  { key: "ANNOUNCEMENT", label: "Announcement bar text", group: "Site", hint: "optional — shown on the home page HUD" },
  { key: "MAINTENANCE_MODE", label: "Maintenance mode", group: "Site", hint: "true / false — checkout is paused, admins can still sign in" },

  // DivinityCoin
  { key: "DIVINITYCOIN_API_URL", label: "DivinityCoin API base URL", group: "DivinityCoin", hint: "https://divinitycoin.com (default) — public HTTPS, no VPN or allow-list needed" },
  { key: "DIVINITYCOIN_API_KEY", label: "DivinityCoin secret API key (sk_…)", group: "DivinityCoin", secret: true, hint: "The SECRET key from DivinityCoin → Partners → API keys (starts sk_). Sent as Authorization: Bearer <key>. The public key (pk_…) is for browser SDKs only and is not used here: every call is server to server." },
  { key: "DIVINITYCOIN_AUTH_HEADER", label: "API key header name", group: "DivinityCoin", hint: "Authorization (default)" },
  { key: "DIVINITYCOIN_PARTNER_SLUG", label: "Partner slug registered on DivinityCoin", group: "DivinityCoin", hint: "forevercomiccon — the slug in your sk_<slug>_… key" },
  { key: "DIVINITYCOIN_WEBHOOK_SECRET", label: "DivinityCoin webhook signing secret", group: "DivinityCoin", secret: true, hint: "From DivinityCoin → Partners → Settings → Webhook secret (generate one there and paste it here). HMAC-SHA256 over the raw body. In test mode any long random string works." },
  { key: "DIVINITYCOIN_WEBHOOK_URL", label: "Webhook URL (paste into DivinityCoin partner settings)", group: "DivinityCoin", readonly: true, hint: "https://<site>/api/webhooks/divinitycoin" },
  { key: "DIVINITYCOIN_INTERNAL_PATH", label: "Internal API path prefix", group: "DivinityCoin", hint: "/internal (default). Calls are POST <prefix>?action=…" },
  { key: "DIVINITYCOIN_ALLOW_CREDITS", label: "Allow paying with DivinityCoin credit balance", group: "DivinityCoin", hint: "true / false" },
  { key: "DIVINITYCOIN_TEST_MODE", label: "Test mode", group: "DivinityCoin", hint: "true — the checkout frame loads a local simulator that posts signed events to our own webhook; no card is charged" },

  // SendGrid
  { key: "SENDGRID_API_KEY", label: "SendGrid API key", group: "SendGrid", secret: true, hint: "SG.… — blank = emails are logged to the server console and recorded as failed" },
  { key: "MAIL_FROM", label: "Outgoing from address", group: "SendGrid", hint: "hello@forevercomiccon.com (verified sender)" },
  { key: "MAIL_FROM_NAME", label: "Outgoing from name", group: "SendGrid", hint: "ForeverComicCon" },
  { key: "MAIL_REPLY_TO", label: "Reply-to address", group: "SendGrid" },
  { key: "MAIL_BCC_ADMIN", label: "BCC admin on payment emails", group: "SendGrid", hint: "optional" },
  { key: "MAIL_FOOTER", label: "Email footer text", group: "SendGrid" },
  { key: "INBOUND_EMAIL_KEY", label: "Inbound Parse key", group: "SendGrid", secret: true, hint: "any long random string; Inbound Parse URL = /api/webhooks/sendgrid/inbound?key=<it>" },
  { key: "SENDGRID_EVENT_KEY", label: "Event webhook key", group: "SendGrid", secret: true, hint: "Event Webhook URL = /api/webhooks/sendgrid/events?key=<it>" },
  { key: "SENDGRID_TRACKING", label: "Open/click tracking", group: "SendGrid", hint: "true / false" },

  // Economy
  { key: "BASE_CLAIM_PRICE_CENTS", label: "Price per floor (cents)", group: "Economy", hint: "500 = $5 per floor" },
  { key: "TAKEOVER_MULTIPLIER", label: "Takeover multiplier", group: "Economy", hint: "1.25" },
  { key: "SELLER_PREMIUM_SHARE", label: "Seller share of the takeover premium", group: "Economy", hint: "0.6 = seller keeps 60% of the 25%, platform 40%" },
  { key: "REFUND_WINDOW_HOURS", label: "Refund window for claims (hours)", group: "Economy", hint: "24" },

  // Security
  { key: "ADMIN_EMAILS", label: "Admin emails (bootstrap)", group: "Security", hint: "comma separated — these accounts are admins on first sign-in; manage the rest in Users" },
  { key: "ADMIN_ALLOWED_IPS", label: "Admin IP allow-list", group: "Security", hint: "comma separated, blank = any" },
  { key: "CRON_SECRET", label: "Cron secret", group: "Security", secret: true, hint: "/api/cron/* accept ?secret= or a Bearer token" },
];

const cache = new Map<string, { v: string; t: number }>();
const TTL = 15_000;

export async function getSetting(key: string): Promise<string> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  let v = "";
  try {
    await ensureMigrated();
    const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
    if (row?.value) v = row.value;
  } catch {
    /* table may not exist yet */
  }
  if (!v) v = process.env[key] || "";
  cache.set(key, { v, t: Date.now() });
  return v;
}

export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(keys.map(async (k) => { out[k] = await getSetting(k); }));
  return out;
}

export async function setSetting(key: string, value: string) {
  await ensureMigrated();
  await db.insert(schema.settings).values({ key, value, updatedAt: Date.now() }).onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: Date.now() } });
  cache.delete(key);
}

export async function deleteSetting(key: string) {
  await ensureMigrated();
  await db.delete(schema.settings).where(eq(schema.settings.key, key));
  cache.delete(key);
}

export function flag(v: string, fallback = false): boolean {
  if (!v) return fallback;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

export async function siteUrl(): Promise<string> {
  return ((await getSetting("SITE_URL")) || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export async function siteName(): Promise<string> {
  return (await getSetting("SITE_NAME")) || process.env.NEXT_PUBLIC_SITE_NAME || "ForeverComicCon";
}
