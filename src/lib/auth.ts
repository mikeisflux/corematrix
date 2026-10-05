import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { newCode, newId, newToken, now } from "@/lib/util";
import { sendTemplate } from "@/lib/sendgrid";
import { SITE_NAME, SITE_URL, REFERRAL_CREDIT_CENTS } from "@/lib/config";
import { bumpSiteDaily } from "@/lib/analytics";
import { getSetting } from "@/lib/settings";

const SESSION_COOKIE = "fcc_session";
const SESSION_TTL = 90 * 86_400_000;
const LOGIN_TTL = 20 * 60_000;

export type User = typeof schema.users.$inferSelect;

export async function currentUser(): Promise<User | null> {
  await ensureMigrated();
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  const [s] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, sid)).limit(1);
  if (!s || s.expiresAt < now()) return null;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, s.userId)).limit(1);
  return u ?? null;
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}

export function isAdminEmail(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

/** Admin = users.isAdmin, or an email on the ADMIN_EMAILS setting (bootstrap). */
export async function requireAdmin(): Promise<User | null> {
  const u = await currentUser();
  if (!u) return null;
  if (u.isAdmin) return u;
  const list = ((await getSetting("ADMIN_EMAILS")) || process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.includes(u.email.toLowerCase())) {
    await db.update(schema.users).set({ isAdmin: true }).where(eq(schema.users.id, u.id));
    return { ...u, isAdmin: true };
  }
  return null;
}

export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return (h.get("x-forwarded-for") || h.get("x-real-ip") || "").split(",")[0].trim() || "0.0.0.0";
  } catch { return "0.0.0.0"; }
}

export async function userAgent(): Promise<string> {
  try { return (await headers()).get("user-agent") || ""; } catch { return ""; }
}

/** The buyer's browser, for DivinityCoin fraud evidence. Never the server's own address. */
export async function requestOrigin(): Promise<{ ip: string | null; userAgent: string | null }> {
  const ip = await clientIp();
  return { ip: ip === "0.0.0.0" ? null : ip, userAgent: (await userAgent()) || null };
}

export async function audit(adminId: string, action: string, resource: string, resourceId?: string | null, before?: unknown, after?: unknown, adminEmail?: string) {
  try {
    await db.insert(schema.adminAuditLog).values({
      id: newId(), adminId, adminEmail: adminEmail ?? null, action, resource, resourceId: resourceId ?? null,
      before: before === undefined ? null : JSON.stringify(before), after: after === undefined ? null : JSON.stringify(after),
      ip: await clientIp(), createdAt: now(),
    });
  } catch (err) { console.error("audit", err); }
}

export async function requestMagicLink(emailRaw: string, next?: string, ref?: string): Promise<{ devLink?: string }> {
  await ensureMigrated();
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email");
  const token = newToken();
  await db.insert(schema.loginTokens).values({ token, email, expiresAt: now() + LOGIN_TTL });
  const params = new URLSearchParams({ token });
  if (next) params.set("next", next);
  if (ref) params.set("ref", ref);
  const link = `${SITE_URL}/login/verify?${params.toString()}`;
  await sendTemplate("magic_link", email, {
    subject: `Your ${SITE_NAME} sign-in link`,
    fallbackText: `Sign in to ${SITE_NAME}: ${link}\n\nThis link expires in 20 minutes.`,
    fallbackHtml: `<p>Click to sign in to ${SITE_NAME}:</p><p><a href="${link}">${link}</a></p><p>This link expires in 20 minutes.</p>`,
    link,
  }, { channel: "system" });
  const configured = !!(await getSetting("SENDGRID_API_KEY"));
  return configured ? {} : { devLink: link };
}

export async function consumeMagicLink(token: string, ref?: string): Promise<User | null> {
  await ensureMigrated();
  const [t] = await db.select().from(schema.loginTokens).where(eq(schema.loginTokens.token, token)).limit(1);
  if (!t || t.usedAt || t.expiresAt < now()) return null;
  await db.update(schema.loginTokens).set({ usedAt: now() }).where(eq(schema.loginTokens.token, token));
  const user = await findOrCreateUser(t.email, ref);
  await createSession(user.id);
  return user;
}

export async function findOrCreateUser(email: string, ref?: string): Promise<User> {
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing) return existing;
  let referredBy: string | null = null;
  if (ref) {
    const [r] = await db.select().from(schema.users).where(eq(schema.users.referralCode, ref.toUpperCase())).limit(1);
    if (r) referredBy = r.id;
  }
  const user: typeof schema.users.$inferInsert = {
    id: newId(),
    email,
    displayName: email.split("@")[0],
    referralCode: newCode(),
    referredBy,
    creditCents: referredBy ? REFERRAL_CREDIT_CENTS : 0,
    isAdmin: isAdminEmail(email),
    createdAt: now(),
    lastSeenAt: now(),
  };
  await db.insert(schema.users).values(user);
  await bumpSiteDaily({ signups: 1 });
  if (referredBy) {
    await db
      .update(schema.users)
      .set({ creditCents: (await creditOf(referredBy)) + REFERRAL_CREDIT_CENTS })
      .where(eq(schema.users.id, referredBy));
    await db.insert(schema.notifications).values({
      id: newId(),
      userId: referredBy,
      type: "referral",
      title: "Someone joined with your link",
      body: `You both earned $${(REFERRAL_CREDIT_CENTS / 100).toFixed(2)} in booth credit.`,
      createdAt: now(),
    });
  }
  return (await db.select().from(schema.users).where(eq(schema.users.id, user.id)))[0];
}

async function creditOf(userId: string): Promise<number> {
  const [u] = await db.select({ c: schema.users.creditCents }).from(schema.users).where(eq(schema.users.id, userId));
  return u?.c ?? 0;
}

export async function createSession(userId: string): Promise<void> {
  const id = newToken();
  await db.insert(schema.sessions).values({ id, userId, expiresAt: now() + SESSION_TTL, createdAt: now() });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL / 1000,
  });
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (sid) await db.delete(schema.sessions).where(eq(schema.sessions.id, sid));
  jar.delete(SESSION_COOKIE);
}

/** Stable, privacy-preserving visitor id derived from a first-party cookie. */
export async function visitorId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get("fcc_vid")?.value;
  if (existing) return existing;
  const h = await headers();
  // Can't set cookies from a server component render; the client sets it. Fall back to a hash of UA+IP.
  const ua = h.get("user-agent") ?? "";
  const ip = h.get("x-forwarded-for") ?? "";
  return `h_${simpleHash(ua + "|" + ip)}`;
}

export function simpleHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
