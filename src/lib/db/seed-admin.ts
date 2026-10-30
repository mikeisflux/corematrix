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
import { HOUSE_BOOTH_IDS } from "@/lib/config";
import { boothSpace, REMOVED_LABELS } from "@/lib/hall/layout";

export const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || "divinitycomicsinc@gmail.com").trim().toLowerCase();
// no password in the source: set SUPERADMIN_PASSWORD, or a random one is generated and printed once to the server log
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || randomBytes(12).toString("base64url");
const PASSWORD_FROM_ENV = !!process.env.SUPERADMIN_PASSWORD;

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
      console.log(`[seed] superadmin ${SUPERADMIN_EMAIL} ${existing.isAdmin ? "" : "promoted"}${existing.passwordHash ? "" : PASSWORD_FROM_ENV ? " password set from SUPERADMIN_PASSWORD" : ` password set to ${SUPERADMIN_PASSWORD} (change it after signing in)`}`);
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
  if (adminId) {
    for (const id of HOUSE_BOOTH_IDS) await seedHouseBooth(db, adminId, id);
    for (const id of ADMIN_BOOTH_IDS) await seedAdminBooth(db, adminId, id);
    await warnRemovedOwned(db);
  }
}

/** Ordinary booths the superadmin holds: claimed once, then left exactly as they are styled and laid out. */
const ADMIN_BOOTH_IDS = [471]; // 1902, the island at the front of Hall E

async function seedAdminBooth(db: LibSQLDatabase<typeof schema>, ownerId: string, id: number): Promise<void> {
  const space = boothSpace(id);
  if (!space) return;
  const [row] = await db.select({ ownerId: schema.booths.ownerId }).from(schema.booths).where(eq(schema.booths.id, id)).limit(1);
  if (row?.ownerId) { if (row.ownerId !== ownerId) console.warn(`[seed] booth ${space.label} is owned by someone else; leaving it`); return; }
  const t = now();
  // given, not bought: the whole value is free, so a takeover pays the show and not a seller
  const claim = { ownerId, name: "ForeverComicCon", tagline: "The show that never closes", website: "https://forevercomiccon.com", logoUrl: "/icon-512.png", category: "comics", valueCents: space.priceCents, freeValueCents: space.priceCents, claimedAt: t, lastSoldAt: t, salesCount: 1, hidden: false, updatedAt: t };
  if (row) await db.update(schema.booths).set(claim).where(eq(schema.booths.id, id));
  else await db.insert(schema.booths).values({ id, label: space.label, size: space.size, kind: space.kind, hall: space.hall, aisle: space.aisle, ...claim });
  console.log(`[seed] booth ${space.label} claimed for ${SUPERADMIN_EMAIL}`);
}

/** A space taken off the plan disappears from the hall: if someone owned it, the operator has to move or refund them. */
async function warnRemovedOwned(db: LibSQLDatabase<typeof schema>): Promise<void> {
  const rows = await db.select({ label: schema.booths.label, ownerId: schema.booths.ownerId, valueCents: schema.booths.valueCents }).from(schema.booths);
  for (const r of rows) if (r.ownerId && REMOVED_LABELS.has(r.label)) console.warn(`[seed] WARNING: booth ${r.label} is owned (user ${r.ownerId}, value ${r.valueCents}c) but no longer on the floor plan; move or refund the owner`);
}

/**
 * The house booths: the first 20×20 island inside the entrance (1702) and the
 * island at 1914 belong to the show itself. Headliner tier, 16 ft banners, shielded from takeovers. Written
 * on every boot so it is always maxed out; a booth someone else already owns
 * is left alone.
 */
async function seedHouseBooth(db: LibSQLDatabase<typeof schema>, ownerId: string, id: number): Promise<void> {
  const space = boothSpace(id);
  if (!space) return;
  const [row] = await db.select({ ownerId: schema.booths.ownerId }).from(schema.booths).where(eq(schema.booths.id, id)).limit(1);
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
    // already claimed by the superadmin: keep whatever they named and styled it, just guarantee the perks
    await db.update(schema.booths).set({ tier: "landmark", tierUntil: forever, notForSaleUntil: forever, bannerHeight: 16, bookSlots: 16, hidden: false, ownerId }).where(eq(schema.booths.id, id));
  } else {
    await db.insert(schema.booths).values({ id, ...house, valueCents: 100000, claimedAt: t, lastSoldAt: t, salesCount: 1 });
    console.log(`[seed] house booth ${space.label} claimed for ${SUPERADMIN_EMAIL}`);
  }
}
