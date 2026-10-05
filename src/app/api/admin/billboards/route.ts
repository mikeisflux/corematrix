import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { audit } from "@/lib/auth";
import { now } from "@/lib/util";
import { guard, bad, notFound, readJson, int } from "../_lib";
export const dynamic = "force-dynamic";
export async function GET() {
  const g = await guard(); if (g instanceof NextResponse) return g;
  await ensureMigrated();
  const bb = schema.billboards, u = schema.users;
  const rows = await db.select({ id: bb.id, slot: bb.slot, headline: bb.headline, body: bb.body, website: bb.website, imageUrl: bb.imageUrl, color: bb.color, startsAt: bb.startsAt, endsAt: bb.endsAt, amountCents: bb.amountCents, seen: bb.seen, opens: bb.opens, clicks: bb.clicks, status: bb.status, createdAt: bb.createdAt, ownerId: bb.ownerId, ownerEmail: u.email, plotId: bb.plotId }).from(bb).leftJoin(u, eq(u.id, bb.ownerId)).orderBy(desc(bb.createdAt)).limit(300);
  return NextResponse.json({ rows });
}
/* POST { id, action: "end" | "reject" | "activate" | "extend", days? } */
export async function POST(req: Request) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const b = await readJson<{ id?: string; action?: string; days?: number }>(req);
  const [row] = await db.select().from(schema.billboards).where(eq(schema.billboards.id, String(b.id || "")));
  if (!row) return notFound();
  const before = { status: row.status, endsAt: row.endsAt };
  let data: Partial<typeof schema.billboards.$inferInsert>;
  switch (b.action) {
    case "end": data = { status: "ended", endsAt: Math.min(row.endsAt, now()) }; break;
    case "reject": data = { status: "rejected", endsAt: Math.min(row.endsAt, now()) }; break;
    case "activate": data = { status: "active", endsAt: row.endsAt > now() ? row.endsAt : now() + 7 * 86_400_000 }; break;
    case "extend": data = { endsAt: Math.max(row.endsAt, now()) + int(b.days, 7) * 86_400_000, status: row.status === "ended" ? "active" : row.status }; break;
    default: return bad("Unknown action");
  }
  await db.update(schema.billboards).set(data).where(eq(schema.billboards.id, row.id));
  await audit(g.id, `billboard.${b.action}`, "billboard", row.id, before, data, g.email);
  return NextResponse.json({ ok: true });
}
