/**
 * Friends and teams. People meet on the floor and send a friend request; once
 * accepted either can add the other to a team. An exhibitor's teams staff
 * their booths: a member of the team a booth is assigned to may sit at its
 * table. Email invites attach to the account when that person signs in.
 */
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { newId, now } from "@/lib/util";
import { publishTo } from "@/lib/realtime";
import { visitorsOf } from "@/lib/presence";

export interface Person { id: string; name: string; handle: string | null }
const person = (u: { id: string; displayName: string | null; handle: string | null; email: string }): Person => ({ id: u.id, name: u.displayName || u.email.split("@")[0], handle: u.handle });

async function people(ids: string[]): Promise<Map<string, Person>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: schema.users.id, displayName: schema.users.displayName, handle: schema.users.handle, email: schema.users.email }).from(schema.users).where(inArray(schema.users.id, ids));
  return new Map(rows.map((u) => [u.id, person(u)]));
}

/* ---------- friends ---------- */

export async function friendsOf(userId: string): Promise<{ friends: Person[]; incoming: Array<Person & { requestId: string }>; outgoing: Array<Person & { requestId: string }> }> {
  await ensureMigrated();
  const rows = await db.select().from(schema.friendships).where(or(eq(schema.friendships.fromId, userId), eq(schema.friendships.toId, userId)));
  const who = await people(Array.from(new Set(rows.map((r) => (r.fromId === userId ? r.toId : r.fromId)))));
  const friends: Person[] = [], incoming: Array<Person & { requestId: string }> = [], outgoing: Array<Person & { requestId: string }> = [];
  for (const r of rows) {
    const other = who.get(r.fromId === userId ? r.toId : r.fromId); if (!other) continue;
    if (r.status === "accepted") friends.push(other);
    else if (r.toId === userId) incoming.push({ ...other, requestId: r.id });
    else outgoing.push({ ...other, requestId: r.id });
  }
  friends.sort((a, b) => a.name.localeCompare(b.name));
  return { friends, incoming, outgoing };
}

/** The pair's row, whichever direction it was sent. */
async function pair(a: string, b: string) {
  const [r] = await db.select().from(schema.friendships).where(or(and(eq(schema.friendships.fromId, a), eq(schema.friendships.toId, b)), and(eq(schema.friendships.fromId, b), eq(schema.friendships.toId, a))));
  return r ?? null;
}

async function notify(userId: string, type: string, title: string, body: string) {
  await db.insert(schema.notifications).values({ id: newId(), userId, type, title, body, boothId: null, createdAt: now() });
}

/** Send a request; if they already asked you, that accepts it. Returns the resulting status. */
export async function requestFriend(fromId: string, toId: string): Promise<"pending" | "accepted"> {
  await ensureMigrated();
  if (fromId === toId) throw new Error("That's you");
  const [to] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, toId));
  if (!to) throw new Error("No such person");
  const me = (await people([fromId])).get(fromId)!;
  const r = await pair(fromId, toId);
  if (r) {
    if (r.status === "accepted") return "accepted";
    if (r.fromId === fromId) return "pending";
    await db.update(schema.friendships).set({ status: "accepted", acceptedAt: now() }).where(eq(schema.friendships.id, r.id));
    await notify(toId, "friend", `${me.name} accepted your friend request`, "You're friends now. Find them under People → Friends.");
    publishTo(visitorsOf(toId), { type: "friend", kind: "accepted", from: me });
    return "accepted";
  }
  await db.insert(schema.friendships).values({ id: newId(), fromId, toId, status: "pending", createdAt: now() });
  await notify(toId, "friend", `${me.name} sent you a friend request`, "Accept it under People → Friends in the hall.");
  publishTo(visitorsOf(toId), { type: "friend", kind: "request", from: me });
  return "pending";
}

export async function answerRequest(userId: string, requestId: string, accept: boolean) {
  await ensureMigrated();
  const [r] = await db.select().from(schema.friendships).where(eq(schema.friendships.id, requestId));
  if (!r || r.toId !== userId || r.status !== "pending") throw new Error("No such request");
  if (!accept) { await db.delete(schema.friendships).where(eq(schema.friendships.id, r.id)); return; }
  await db.update(schema.friendships).set({ status: "accepted", acceptedAt: now() }).where(eq(schema.friendships.id, r.id));
  const me = (await people([userId])).get(userId)!;
  await notify(r.fromId, "friend", `${me.name} accepted your friend request`, "You're friends now. Find them under People → Friends.");
  publishTo(visitorsOf(r.fromId), { type: "friend", kind: "accepted", from: me });
}

/** Remove a friend or withdraw a request you sent. */
export async function unfriend(userId: string, otherId: string) {
  await ensureMigrated();
  const r = await pair(userId, otherId);
  if (r) await db.delete(schema.friendships).where(eq(schema.friendships.id, r.id));
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  const r = await pair(a, b);
  return !!r && r.status === "accepted";
}

/* ---------- teams ---------- */

export interface TeamView { id: string; name: string; booths: number[]; members: Array<{ id: string; userId: string | null; email: string; name: string | null }> }

export async function teamsOf(ownerId: string): Promise<TeamView[]> {
  await ensureMigrated();
  const ts = await db.select().from(schema.teams).where(eq(schema.teams.ownerId, ownerId));
  if (ts.length === 0) return [];
  const ids = ts.map((t) => t.id);
  const members = await db.select().from(schema.teamMembers).where(inArray(schema.teamMembers.teamId, ids));
  const booths = await db.select({ id: schema.booths.id, teamId: schema.booths.teamId }).from(schema.booths).where(inArray(schema.booths.teamId, ids));
  const who = await people(members.map((m) => m.userId).filter((x): x is string => !!x));
  return ts.map((t) => ({
    id: t.id, name: t.name,
    booths: booths.filter((b) => b.teamId === t.id).map((b) => b.id),
    members: members.filter((m) => m.teamId === t.id).map((m) => ({ id: m.id, userId: m.userId, email: m.email, name: m.userId ? (who.get(m.userId)?.name ?? null) : null })),
  }));
}

export async function createTeam(ownerId: string, name: string): Promise<string> {
  await ensureMigrated();
  const n = name.trim().slice(0, 40); if (!n) throw new Error("Give the team a name");
  const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(schema.teams).where(eq(schema.teams.ownerId, ownerId));
  if (Number(c) >= 20) throw new Error("That's plenty of teams");
  const id = newId();
  await db.insert(schema.teams).values({ id, ownerId, name: n, createdAt: now() });
  return id;
}

async function ownTeam(ownerId: string, teamId: string) {
  const [t] = await db.select().from(schema.teams).where(and(eq(schema.teams.id, teamId), eq(schema.teams.ownerId, ownerId)));
  if (!t) throw new Error("No such team");
  return t;
}

export async function renameTeam(ownerId: string, teamId: string, name: string) {
  await ensureMigrated(); await ownTeam(ownerId, teamId);
  const n = name.trim().slice(0, 40); if (!n) throw new Error("Give the team a name");
  await db.update(schema.teams).set({ name: n }).where(eq(schema.teams.id, teamId));
}

export async function deleteTeam(ownerId: string, teamId: string) {
  await ensureMigrated(); await ownTeam(ownerId, teamId);
  await db.update(schema.booths).set({ teamId: null }).where(eq(schema.booths.teamId, teamId));
  await db.delete(schema.teamMembers).where(eq(schema.teamMembers.teamId, teamId));
  await db.delete(schema.teams).where(eq(schema.teams.id, teamId));
}

/** Which of the owner's booths this team staffs; a booth has one team, so it leaves any other. */
export async function setTeamBooths(ownerId: string, teamId: string, boothIds: number[]) {
  await ensureMigrated(); await ownTeam(ownerId, teamId);
  const mine = await db.select({ id: schema.booths.id }).from(schema.booths).where(eq(schema.booths.ownerId, ownerId));
  const ok = new Set(mine.map((b) => b.id));
  const want = boothIds.filter((id) => ok.has(id));
  await db.update(schema.booths).set({ teamId: null }).where(eq(schema.booths.teamId, teamId));
  if (want.length) await db.update(schema.booths).set({ teamId }).where(and(eq(schema.booths.ownerId, ownerId), inArray(schema.booths.id, want)));
}

/** Add a friend (by user id) or anyone by email. Friends only, by id: strangers are added by email so nobody gets put on a team they never heard of. */
export async function addMember(ownerId: string, teamId: string, who: { userId?: string; email?: string }) {
  await ensureMigrated(); await ownTeam(ownerId, teamId);
  let userId: string | null = null, email = (who.email ?? "").trim().toLowerCase();
  if (who.userId) {
    if (!(await areFriends(ownerId, who.userId))) throw new Error("Add friends by name; anyone else by email");
    const [u] = await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, who.userId));
    if (!u) throw new Error("No such person");
    userId = u.id; email = u.email.toLowerCase();
  } else {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("That doesn't look like an email address");
    const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
    userId = u?.id ?? null;
  }
  if (userId === ownerId) throw new Error("You're already on all your teams");
  const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(schema.teamMembers).where(eq(schema.teamMembers.teamId, teamId));
  if (Number(c) >= 50) throw new Error("That team is full (50)");
  const [dup] = await db.select({ id: schema.teamMembers.id }).from(schema.teamMembers).where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.email, email)));
  if (dup) throw new Error("Already on the team");
  await db.insert(schema.teamMembers).values({ id: newId(), teamId, userId, email, createdAt: now() });
  if (userId) {
    const [t] = await db.select({ name: schema.teams.name }).from(schema.teams).where(eq(schema.teams.id, teamId));
    const me = (await people([ownerId])).get(ownerId)!;
    await notify(userId, "team", `${me.name} added you to ${t?.name ?? "a team"}`, "You can sit at the booths that team staffs. Walk up to the chair and press C.");
    publishTo(visitorsOf(userId), { type: "team", name: t?.name ?? "a team", from: me });
  }
}

export async function removeMember(ownerId: string, teamId: string, memberId: string) {
  await ensureMigrated(); await ownTeam(ownerId, teamId);
  await db.delete(schema.teamMembers).where(and(eq(schema.teamMembers.id, memberId), eq(schema.teamMembers.teamId, teamId)));
}

/** Booths this person staffs through a team (matched by account or by the email the invite was sent to), with the team's name. */
export async function staffedBooths(userId: string, email: string): Promise<Array<{ id: number; name: string | null; valueCents: number; tier: string; color: string; team: string }>> {
  await ensureMigrated();
  const ms = await db.select({ teamId: schema.teamMembers.teamId, userId: schema.teamMembers.userId }).from(schema.teamMembers)
    .where(or(eq(schema.teamMembers.userId, userId), eq(schema.teamMembers.email, email.toLowerCase())));
  if (ms.length === 0) return [];
  // an email invite becomes a proper membership the first time that account shows up
  const unlinked = ms.filter((m) => !m.userId);
  if (unlinked.length) await db.update(schema.teamMembers).set({ userId }).where(and(eq(schema.teamMembers.email, email.toLowerCase()), sql`${schema.teamMembers.userId} IS NULL`));
  const teamIds = Array.from(new Set(ms.map((m) => m.teamId)));
  const rows = await db.select({ id: schema.booths.id, name: schema.booths.name, valueCents: schema.booths.valueCents, tier: schema.booths.tier, color: schema.booths.color, team: schema.teams.name })
    .from(schema.booths).innerJoin(schema.teams, eq(schema.teams.id, schema.booths.teamId))
    .where(and(inArray(schema.booths.teamId, teamIds), eq(schema.booths.hidden, false)));
  return rows;
}
