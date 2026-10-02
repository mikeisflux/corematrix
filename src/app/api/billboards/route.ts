import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { db, ensureMigrated, schema } from "@/lib/db";
import { activeBillboards } from "@/lib/economy";

export const dynamic = "force-dynamic";

/** Public: active campaigns. Owner (?mine=1): all of their campaigns with stats. */
export async function GET(req: Request) {
  await ensureMigrated();
  if (new URL(req.url).searchParams.get("mine")) {
    const u = await currentUser();
    if (!u) return NextResponse.json({ billboards: [] });
    const rows = await db.select().from(schema.billboards).where(eq(schema.billboards.ownerId, u.id)).orderBy(desc(schema.billboards.createdAt));
    return NextResponse.json({ billboards: rows });
  }
  return NextResponse.json({ billboards: await activeBillboards() });
}
