/**
 * The superadmin. Created on first boot so the site is never without an
 * admin login; nothing to run on the server. Email/password can be
 * overridden with SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD in .env.
 *
 * Idempotent: an existing account is promoted to admin; its password is only
 * set when it has none, so a password changed in the app is never reverted.
 */
import { eq } from "drizzle-orm";
import { randomBytes, scryptSync } from "node:crypto";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { newCode, newId, now } from "@/lib/util";

export const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || "divinitycomicsinc@gmail.com").trim().toLowerCase();
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || "DFLKji4i9ksl";

function hash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

export async function seedSuperadmin(db: LibSQLDatabase<typeof schema>): Promise<void> {
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, SUPERADMIN_EMAIL)).limit(1);
  if (existing) {
    if (!existing.isAdmin || !existing.passwordHash) {
      await db.update(schema.users).set({ isAdmin: true, ...(existing.passwordHash ? {} : { passwordHash: hash(SUPERADMIN_PASSWORD) }) }).where(eq(schema.users.id, existing.id));
      console.log(`[seed] superadmin ${SUPERADMIN_EMAIL} ${existing.isAdmin ? "" : "promoted"}${existing.passwordHash ? "" : " password set"}`);
    }
    return;
  }
  await db.insert(schema.users).values({
    id: newId(),
    email: SUPERADMIN_EMAIL,
    displayName: "Superadmin",
    referralCode: newCode(),
    creditCents: 0,
    isAdmin: true,
    passwordHash: hash(SUPERADMIN_PASSWORD),
    createdAt: now(),
    lastSeenAt: now(),
  });
  console.log(`[seed] superadmin ${SUPERADMIN_EMAIL} created`);
}
