import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { dailyCheckIn } from "@/lib/arcade";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ user: null });
  const checkin = await dailyCheckIn(u.id);
  const booths = await db
    .select({ id: schema.booths.id, name: schema.booths.name, valueCents: schema.booths.valueCents, tier: schema.booths.tier, color: schema.booths.color })
    .from(schema.booths)
    .where(and(eq(schema.booths.ownerId, u.id), eq(schema.booths.hidden, false)))
    .orderBy(desc(schema.booths.valueCents));
  const [unread] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, u.id), sql`${schema.notifications.readAt} IS NULL`));
  return NextResponse.json({
    user: {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      handle: u.handle,
      coins: checkin.coins,
      streak: checkin.streak,
      awardedToday: checkin.awarded,
      creditCents: u.creditCents,
      referralCode: u.referralCode,
      isAdmin: u.isAdmin,
      notifyEmail: u.notifyEmail,
      avatar: u.avatar ? JSON.parse(u.avatar) : null,
      unread: Number(unread?.n ?? 0),
    },
    booths,
  });
}

export async function PATCH(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { notifyEmail?: boolean; displayName?: string; handle?: string; avatar?: Record<string, unknown> };
  const set: Partial<typeof schema.users.$inferInsert> = {};
  if (body.avatar && typeof body.avatar === "object") {
    const a = body.avatar as Record<string, unknown>;
    const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
    set.avatar = JSON.stringify({ body: a.body === "b" ? "b" : "a", skin: hex(a.skin, "#c68642"), hair: ["short", "long", "buzz", "bun", "curly", "bald"].includes(String(a.hair)) ? a.hair : "short", hairColor: hex(a.hairColor, "#2b1b12"), shirt: hex(a.shirt, "#e63946"), pants: hex(a.pants, "#1f2a44") });
  }
  if (typeof body.notifyEmail === "boolean") set.notifyEmail = body.notifyEmail;
  if (typeof body.displayName === "string") set.displayName = body.displayName.trim().slice(0, 40) || u.displayName;
  if (typeof body.handle === "string") set.handle = body.handle.replace(/^@/, "").trim().slice(0, 30) || null;
  if (Object.keys(set).length) await db.update(schema.users).set(set).where(eq(schema.users.id, u.id));
  return NextResponse.json({ ok: true });
}
