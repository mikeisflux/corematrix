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

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const MIN_PASSWORD = 10;

/** Create an account with a password and sign in. Referral codes still apply. */
export async function register(emailRaw: string, password: string, displayName?: string, ref?: string): Promise<User> {
  await ensureMigrated();
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email");
  if (password.length < MIN_PASSWORD) throw new Error(`Password must be at least ${MIN_PASSWORD} characters`);
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing) throw new Error("That email already has an account. Sign in instead.");
  const user = await findOrCreateUser(email, ref);
  await db.update(schema.users).set({ passwordHash: hashPassword(password), displayName: displayName?.trim().slice(0, 40) || user.displayName }).where(eq(schema.users.id, user.id));
  await createSession(user.id);
  return user;
}

/** Password reset: emails a one-time link (20 minutes). Always returns ok so emails can't be enumerated. */
export async function requestPasswordReset(emailRaw: string): Promise<void> {
  await ensureMigrated();
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email");
  const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!u) return;
  const token = newToken();
  await db.insert(schema.loginTokens).values({ token, email, expiresAt: now() + LOGIN_TTL });
  const link = `${SITE_URL}/app/login/reset?token=${token}`;
  await sendTemplate("password_reset", email, {
    subject: `Reset your ${SITE_NAME} password`,
    fallbackText: `Reset your password: ${link}\n\nThis link expires in 20 minutes. If you didn't ask for it, ignore this email.`,
    fallbackHtml: `<p>Reset your ${SITE_NAME} password:</p><p><a href="${link}">${link}</a></p><p>This link expires in 20 minutes.</p>`,
    link,
  }, { channel: "system", userId: u.id });
}

export async function resetPassword(token: string, password: string): Promise<User | null> {
  await ensureMigrated();
  if (password.length < MIN_PASSWORD) throw new Error(`Password must be at least ${MIN_PASSWORD} characters`);
  const [t] = await db.select().from(schema.loginTokens).where(eq(schema.loginTokens.token, token)).limit(1);
  if (!t || t.usedAt || t.expiresAt < now()) return null;
  await db.update(schema.loginTokens).set({ usedAt: now() }).where(eq(schema.loginTokens.token, token));
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, t.email)).limit(1);
  if (!u) return null;
  await db.update(schema.users).set({ passwordHash: hashPassword(password) }).where(eq(schema.users.id, u.id));
  await createSession(u.id);
  return u;
}

/** Signed-in user changes their own password. */
export async function changePassword(userId: string, current: string, next: string): Promise<void> {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!u || !verifyPassword(current, u.passwordHash)) throw new Error("Current password is wrong");
  await setPassword(userId, next);
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

/* ---------- optional password sign-in (scrypt, no extra deps) ---------- */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [algo, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const a = Buffer.from(hash, "hex"), b = scryptSync(password, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function setPassword(userId: string, password: string | null): Promise<void> {
  if (password !== null && password.length < MIN_PASSWORD) throw new Error(`Password must be at least ${MIN_PASSWORD} characters`);
  await db.update(schema.users).set({ passwordHash: password ? hashPassword(password) : null }).where(eq(schema.users.id, userId));
}
/** Email + password sign-in. */
export async function signInWithPassword(emailRaw: string, password: string): Promise<User | null> {
  await ensureMigrated();
  const email = emailRaw.trim().toLowerCase();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!u || !verifyPassword(password, u.passwordHash)) return null;
  await createSession(u.id);
  return u;
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
