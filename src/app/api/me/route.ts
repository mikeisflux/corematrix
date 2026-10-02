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
  const plots = await db
    .select({ id: schema.plots.id, name: schema.plots.name, valueCents: schema.plots.valueCents, tier: schema.plots.tier, color: schema.plots.color })
    .from(schema.plots)
    .where(and(eq(schema.plots.ownerId, u.id), eq(schema.plots.hidden, false)))
    .orderBy(desc(schema.plots.valueCents));
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
      unread: Number(unread?.n ?? 0),
    },
    plots,
  });
}
