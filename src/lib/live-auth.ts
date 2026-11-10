/**
 * Who is on the other end of a socket, from the raw Cookie header: the public floor id from the visitor cookie and
 * the signed-in account from the session cookie. The request helpers in lib/auth and lib/visitor read Next's cookie
 * jar, which a WebSocket upgrade does not have.
 */
import { eq } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { publicId, VID_COOKIE } from "@/lib/visitor";
import { now } from "@/lib/util";
import type { User } from "@/lib/auth";

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) { const i = part.indexOf("="); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
export async function identityFromCookies(header: string | undefined): Promise<{ visitorId: string | null; user: User | null }> {
  await ensureMigrated();
  const c = parseCookies(header);
  const vid = c[VID_COOKIE];
  const visitorId = vid ? await publicId(vid) : null;
  let user: User | null = null;
  const sid = c["fcc_session"];
  if (sid) {
    const [s] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, sid)).limit(1);
    if (s && s.expiresAt >= now()) { const [u] = await db.select().from(schema.users).where(eq(schema.users.id, s.userId)).limit(1); user = u ?? null; }
  }
  return { visitorId, user };
}
