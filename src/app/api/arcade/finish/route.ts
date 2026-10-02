import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { finishPlay } from "@/lib/arcade";
import { db, schema } from "@/lib/db";

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const parsed = z.object({ playId: z.string().max(40), score: z.number().int().min(0).max(10_000_000) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad score" }, { status: 400 });
  const [plot] = await db.select({ id: schema.plots.id, name: schema.plots.name }).from(schema.plots).where(eq(schema.plots.ownerId, u.id)).orderBy(desc(schema.plots.valueCents)).limit(1);
  try {
    const r = await finishPlay(u.id, parsed.data.playId, parsed.data.score, plot?.name ?? u.displayName ?? "player", plot?.id ?? null);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
