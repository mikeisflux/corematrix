/**
 * Who may manage a booth: its owner, and the team members the owner made managers (team_members.role = "manager")
 * on a team that staffs the booth. Managing means the listing, art, comics, portfolio and shop; money (boosts,
 * takeovers, plans, payouts), the team itself and releasing the booth stay with the owner.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";

type BoothLike = { id: number; ownerId: string | null; teamId?: string | null };

export async function isBoothManager(userId: string, booth: BoothLike): Promise<boolean> {
  if (!booth.teamId || !booth.ownerId) return false;
  await ensureMigrated();
  const [m] = await db.select({ id: schema.teamMembers.id }).from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId))
    .where(and(eq(schema.teamMembers.teamId, booth.teamId), eq(schema.teamMembers.userId, userId), eq(schema.teamMembers.role, "manager"), sql`${schema.teamMembers.acceptedAt} IS NOT NULL`, eq(schema.teams.ownerId, booth.ownerId)))
    .limit(1);
  return !!m;
}

export async function canManageBooth(userId: string, booth: BoothLike): Promise<boolean> {
  return booth.ownerId === userId || (await isBoothManager(userId, booth));
}

/** Booth ids this person manages through a team (not the ones they own). */
export async function managedBoothIds(userId: string): Promise<Set<number>> {
  await ensureMigrated();
  const ms = await db.select({ teamId: schema.teamMembers.teamId }).from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.userId, userId), eq(schema.teamMembers.role, "manager"), sql`${schema.teamMembers.acceptedAt} IS NOT NULL`));
  if (!ms.length) return new Set();
  const rows = await db.select({ id: schema.booths.id }).from(schema.booths)
    .innerJoin(schema.teams, and(eq(schema.teams.id, schema.booths.teamId), eq(schema.teams.ownerId, schema.booths.ownerId)))
    .where(inArray(schema.booths.teamId, Array.from(new Set(ms.map((m) => m.teamId)))));
  return new Set(rows.map((r) => r.id));
}
