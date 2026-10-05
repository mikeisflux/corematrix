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
import { HOUSE_BOOTH_ID } from "@/lib/config";
import { boothSpace } from "@/lib/hall/layout";

export const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || "divinitycomicsinc@gmail.com").trim().toLowerCase();
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || "DFLKji4i9ksl";

function hash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

export async function seedSuperadmin(db: LibSQLDatabase<typeof schema>): Promise<void> {
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, SUPERADMIN_EMAIL)).limit(1);
  let adminId = existing?.id;
  if (existing) {
    if (!existing.isAdmin || !existing.passwordHash) {
      await db.update(schema.users).set({ isAdmin: true, ...(existing.passwordHash ? {} : { passwordHash: hash(SUPERADMIN_PASSWORD) }) }).where(eq(schema.users.id, existing.id));
      console.log(`[seed] superadmin ${SUPERADMIN_EMAIL} ${existing.isAdmin ? "" : "promoted"}${existing.passwordHash ? "" : " password set"}`);
    }
  } else {
    adminId = newId();
    await db.insert(schema.users).values({
      id: adminId,
      email: SUPERADMIN_EMAIL,
      displayName: "ForeverComicCon",
      referralCode: newCode(),
      creditCents: 0,
      isAdmin: true,
      passwordHash: hash(SUPERADMIN_PASSWORD),
      createdAt: now(),
      lastSeenAt: now(),
    });
    console.log(`[seed] superadmin ${SUPERADMIN_EMAIL} created`);
  }
  if (adminId) await seedHouseBooth(db, adminId);
}

/**
 * The house booth: the first 20×20 island inside the entrance belongs to the
 * show itself. Headliner tier, 16 ft banners, shielded from takeovers. Written
 * on every boot so it is always maxed out; a booth someone else already owns
 * is left alone.
 */
async function seedHouseBooth(db: LibSQLDatabase<typeof schema>, ownerId: string): Promise<void> {
  const space = boothSpace(HOUSE_BOOTH_ID);
  if (!space) return;
  const [row] = await db.select({ ownerId: schema.booths.ownerId }).from(schema.booths).where(eq(schema.booths.id, HOUSE_BOOTH_ID)).limit(1);
  if (row?.ownerId && row.ownerId !== ownerId) { console.warn(`[seed] house booth ${space.label} is owned by someone else; leaving it`); return; }
  const t = now();
  const forever = t + 100 * 365 * 86400 * 1000;
  const house = {
    label: space.label, size: space.size, kind: space.kind, hall: space.hall, aisle: space.aisle,
    ownerId,
    name: "ForeverComicCon",
    tagline: "The show that never closes",
    description: "Home base for the convention itself. Grab a booth, walk the floor, play the arcade. See you on the show floor, forever.",
    website: "https://forevercomiccon.com",
    logoUrl: "/icon-512.png",
    color: "#ffd166",
    accent: "#0b0f1a",
    style: "neon",
    cloth: "#0b0f1a",
    category: "comics",
    bannerHeight: 16,
    bookSlots: 16,
    tier: "landmark",
    tierUntil: forever,
    notForSaleUntil: forever,
    hidden: false,
    updatedAt: t,
  };
  if (row) {
    await db.update(schema.booths).set(house).where(eq(schema.booths.id, HOUSE_BOOTH_ID));
  } else {
    await db.insert(schema.booths).values({ id: HOUSE_BOOTH_ID, ...house, valueCents: 100000, claimedAt: t, lastSoldAt: t, salesCount: 1 });
    console.log(`[seed] house booth ${space.label} claimed for ${SUPERADMIN_EMAIL}`);
  }
}
