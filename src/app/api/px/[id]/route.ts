import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { dayKey } from "@/lib/util";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

/**
 * Conversion pixel. Owners drop <img src="https://site/api/px/42?v=4999"> on
 * their thank-you page (or call it from JS) and we count a conversion plus
 * optional value in cents. This is what answers "did this generate sales?".
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureMigrated();
  const { id } = await ctx.params;
  const plotId = Number(id);
  const v = Number(new URL(req.url).searchParams.get("v") ?? 0);
  const cents = Number.isFinite(v) && v > 0 ? Math.min(Math.floor(v), 10_000_000) : 0;
  if (Number.isFinite(plotId) && plotId > 0) {
    await db
      .insert(schema.plotDaily)
      .values({ plotId, day: dayKey(), conversions: 1, conversionValueCents: cents })
      .onConflictDoUpdate({
        target: [schema.plotDaily.plotId, schema.plotDaily.day],
        set: { conversions: sql`${schema.plotDaily.conversions} + 1`, conversionValueCents: sql`${schema.plotDaily.conversionValueCents} + ${cents}` },
      });
  }
  return new NextResponse(GIF, {
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, private", "Access-Control-Allow-Origin": "*" },
  });
}
