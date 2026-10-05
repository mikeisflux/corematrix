import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { audit } from "@/lib/auth";
import { finishWebhook, processDivinityEvent } from "@/lib/orders";
import { guard, bad, notFound } from "../../../_lib";
export const dynamic = "force-dynamic";
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const [ev] = await db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.id, id));
  if (!ev) return notFound();
  if (ev.provider !== "divinitycoin") return bad("Only DivinityCoin events can be reprocessed.");
  const payload = JSON.parse(ev.payload) as Record<string, unknown>;
  const data = (payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, unknown>;
  try {
    const r = await processDivinityEvent({ id: ev.eventId, type: ev.type, data });
    await finishWebhook(id, r.status, r.note ?? null);
    await audit(g.id, "webhook.reprocess", "webhook_event", id, { status: ev.status }, { status: r.status, note: r.note }, g.email);
    return NextResponse.json({ ok: true, result: r });
  } catch (err) {
    const error = String((err as Error).message || err).slice(0, 1000);
    await finishWebhook(id, "failed", error);
    await audit(g.id, "webhook.reprocess", "webhook_event", id, { status: ev.status }, { status: "failed", error }, g.email);
    return bad(error, 500);
  }
}
