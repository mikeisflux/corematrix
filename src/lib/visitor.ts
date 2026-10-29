import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHmac, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { newId } from "@/lib/util";
import { db, ensureMigrated, schema } from "@/lib/db";

export const VID_COOKIE = "fcc_vid";

/** Reads the visitor cookie; if missing, generates one and attaches it to `res`. Private: never send it to other clients. */
export async function getOrSetVisitor(res?: NextResponse): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(VID_COOKIE)?.value;
  if (existing) return existing;
  const id = `v_${newId()}`;
  res?.cookies.set(VID_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  return id;
}

const g = globalThis as unknown as { __fccVisitorSecret?: string };
async function visitorSecret(): Promise<string> {
  if (g.__fccVisitorSecret) return g.__fccVisitorSecret;
  await ensureMigrated();
  // made once per install and kept in settings; the first writer wins if two requests race
  await db.insert(schema.settings).values({ key: "VISITOR_ID_SECRET", value: randomBytes(32).toString("hex"), updatedAt: Date.now() }).onConflictDoNothing();
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "VISITOR_ID_SECRET")).limit(1);
  return (g.__fccVisitorSecret = row.value);
}

/**
 * The id other people see for a visitor: on the floor roster, on DMs, on chat
 * bubbles. It is derived one way from the private cookie, so knowing somebody's
 * floor id gives no way to act as them (read their messages, move their avatar).
 */
export async function publicId(vid: string): Promise<string> {
  return `p_${createHmac("sha256", await visitorSecret()).update(vid).digest("base64url").slice(0, 18)}`;
}

/** This visitor's public floor id, setting the cookie on `res` if they are new. */
export async function getOrSetPlayer(res?: NextResponse): Promise<string> {
  return publicId(await getOrSetVisitor(res));
}
