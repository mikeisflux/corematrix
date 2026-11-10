import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { flag, getSetting } from "@/lib/settings";
import { inspectVrm, removeVrm, storeVrm, VRM_MAX_BYTES } from "@/lib/vrm";

export const dynamic = "force-dynamic";

const avatarOf = (u: { avatar: string | null }) => { try { return (JSON.parse(u.avatar ?? "null") ?? {}) as Record<string, unknown>; } catch { return {}; } };

/** POST: the raw .vrm bytes. Replaces the account's own model; the look (body, colours, costume) stays as a fallback and for the far crowd. */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in to use your own model." }, { status: 401 });
  if (!flag(await getSetting("VRM_UPLOADS"), true)) return NextResponse.json({ error: "Own models are switched off on this show." }, { status: 403 });
  const len = Number(req.headers.get("content-length") || 0);
  if (len > VRM_MAX_BYTES) return NextResponse.json({ error: `The limit is ${VRM_MAX_BYTES / 1048576} MB.` }, { status: 413 });
  const buf = new Uint8Array(await req.arrayBuffer());
  let meta;
  try { meta = inspectVrm(buf); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  const prev = avatarOf(u);
  const url = await storeVrm(u.id, buf);
  await removeVrm(typeof prev.vrm === "string" ? prev.vrm : null);
  const avatar = { ...prev, vrm: url, vrmMeta: meta };
  await db.update(schema.users).set({ avatar: JSON.stringify(avatar) }).where(eq(schema.users.id, u.id));
  return NextResponse.json({ ok: true, vrm: url, meta });
}

/** DELETE: back to the built-in figure. */
export async function DELETE() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const prev = avatarOf(u);
  await removeVrm(typeof prev.vrm === "string" ? prev.vrm : null);
  delete prev.vrm; delete prev.vrmMeta;
  await db.update(schema.users).set({ avatar: JSON.stringify(prev) }).where(eq(schema.users.id, u.id));
  return NextResponse.json({ ok: true });
}
