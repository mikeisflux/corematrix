import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { audit } from "@/lib/auth";
import { guard, bad, readJson } from "../../_lib";

export const dynamic = "force-dynamic";
const ACTIONS: Record<string, { read?: boolean; starred?: boolean; archived?: boolean }> = { read: { read: true }, unread: { read: false }, star: { starred: true }, unstar: { starred: false }, archive: { archived: true }, unarchive: { archived: false } };

export async function POST(req: Request) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const b = await readJson<{ ids?: unknown; action?: unknown }>(req);
  const ids = Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 500) : [];
  const action = String(b.action || "");
  if (!ids.length) return bad("ids required");
  if (action === "delete") {
    await db.delete(schema.mailAttachments).where(inArray(schema.mailAttachments.messageId, ids));
    await db.delete(schema.mailMessages).where(inArray(schema.mailMessages.id, ids));
    await audit(g.id, "email.bulk_delete", "message", null, undefined, { ids, count: ids.length }, g.email);
    return NextResponse.json({ ok: true, count: ids.length });
  }
  const data = ACTIONS[action];
  if (!data) return bad("Unknown action");
  await db.update(schema.mailMessages).set(data).where(inArray(schema.mailMessages.id, ids));
  return NextResponse.json({ ok: true, count: ids.length });
}
