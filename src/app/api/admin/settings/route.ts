import { NextResponse } from "next/server";
import { db, ensureMigrated, schema } from "@/lib/db";
import { audit } from "@/lib/auth";
import { SETTING_KEYS, SETTING_GROUPS, getSetting, setSetting, deleteSetting } from "@/lib/settings";
import { divinityWebhookUrl } from "@/lib/divinitycoin";
import { guard, bad, readJson } from "../_lib";

export const dynamic = "force-dynamic";
const PROTECTED = new Set(["SESSION_SECRET"]);
const mask = (v: string) => (v ? `•••${v.slice(-4)}` : "");

export async function GET(req: Request) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  await ensureMigrated();
  const url = new URL(req.url);
  const reveal = url.searchParams.get("reveal") === "1" ? url.searchParams.get("key") : null;
  if (reveal) {
    if (PROTECTED.has(reveal)) return bad("protected");
    await audit(g.id, "setting.reveal", "setting", reveal, undefined, undefined, g.email);
    return NextResponse.json({ key: reveal, value: await getSetting(reveal) });
  }
  const dbRows = await db.select().from(schema.settings).orderBy(schema.settings.key);
  const inDb = new Set(dbRows.map((r) => r.key));
  const computed: Record<string, string> = { DIVINITYCOIN_WEBHOOK_URL: await divinityWebhookUrl() };
  const known = await Promise.all(SETTING_KEYS.map(async (def) => {
    const raw = def.readonly ? (computed[def.key] ?? (await getSetting(def.key))) : await getSetting(def.key);
    return { ...def, value: def.secret ? mask(raw) : raw, set: !!raw, source: inDb.has(def.key) ? "db" : process.env[def.key] ? "env" : def.readonly ? "computed" : "" };
  }));
  const knownKeys = new Set<string>([...SETTING_KEYS.map((d) => d.key), ...PROTECTED]);
  const custom = dbRows.filter((r) => !knownKeys.has(r.key)).map((r) => ({ key: r.key, value: r.value, updatedAt: r.updatedAt }));
  const groups = SETTING_GROUPS.map((name) => ({ name, keys: known.filter((k) => k.group === name) }));
  return NextResponse.json({ groups, custom });
}
export async function PUT(req: Request) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const b = await readJson<{ key?: string; value?: string }>(req);
  const key = String(b.key || "").trim().slice(0, 100);
  if (!/^[A-Z0-9_]+$/.test(key) || PROTECTED.has(key) || typeof b.value !== "string") return bad("invalid key/value");
  const def = SETTING_KEYS.find((d) => d.key === key);
  if (def?.readonly) return bad("read-only setting");
  const before = await getSetting(key);
  await setSetting(key, b.value);
  await audit(g.id, "setting.set", "setting", key, { value: def?.secret ? mask(before) : before }, { value: def?.secret ? mask(b.value) : b.value }, g.email);
  return NextResponse.json({ ok: true });
}
export async function DELETE(req: Request) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const b = await readJson<{ key?: string }>(req);
  const key = String(b.key || "").trim();
  if (!key || PROTECTED.has(key)) return bad("invalid key");
  await deleteSetting(key);
  await audit(g.id, "setting.delete", "setting", key, undefined, undefined, g.email);
  return NextResponse.json({ ok: true });
}
