import { randomInt } from "node:crypto"; // codes pay for booths: they must not be predictable from a batch
import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { guard, pageParams, paged, like, readJson, bad, toCsv, csvResponse, int, optStr } from "../_lib";
import { newId, now } from "@/lib/util";
import { BOOTH_SIZES } from "@/lib/config";
import { audit } from "@/lib/auth";
export const dynamic = "force-dynamic";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const part = (n: number) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const makeCode = () => `FCC${part(4)}${part(4)}`; // shown as FCC-XXXX-XXXX, stored without dashes

/** GET ?q=&size=&status=open|used|revoked|all&page=  (&export=csv) */
export async function GET(req: Request) {
  const g = await guard("codes"); if (g instanceof NextResponse) return g;
  await ensureMigrated();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim(), size = url.searchParams.get("size") || "", status = url.searchParams.get("status") || "all";
  const t = schema.boothCodes;
  const conds = [];
  if (q) conds.push(sql`(${t.code} LIKE ${like(q.toUpperCase().replace(/[^A-Z0-9]/g, ""))} OR ${t.label} LIKE ${like(q)})`);
  if (size) conds.push(eq(t.size, size));
  if (status === "open") conds.push(sql`${t.revokedAt} IS NULL AND ${t.uses} < ${t.maxUses} AND (${t.expiresAt} IS NULL OR ${t.expiresAt} > ${now()})`);
  else if (status === "used") conds.push(sql`${t.uses} >= ${t.maxUses}`);
  else if (status === "revoked") conds.push(sql`${t.revokedAt} IS NOT NULL`);
  const where = conds.length ? and(...conds) : undefined;
  const cols = { id: t.id, code: t.code, size: t.size, label: t.label, maxUses: t.maxUses, uses: t.uses, expiresAt: t.expiresAt, createdAt: t.createdAt, revokedAt: t.revokedAt, redeemedBy: sql<string>`(select group_concat(u.email, ', ') from code_redemptions r join users u on u.id = r.user_id where r.code_id = booth_codes.id)`, booths: sql<string>`(select group_concat(r.booth_id, ', ') from code_redemptions r where r.code_id = booth_codes.id)` };
  if (url.searchParams.get("export") === "csv") {
    const rows = await db.select(cols).from(t).where(where).orderBy(desc(t.createdAt)).limit(10000);
    return csvResponse("booth-codes.csv", toCsv(["code", "size", "label", "uses", "max_uses", "expires_at", "revoked_at", "redeemed_by", "booths", "created_at"], rows.map((r) => [`${r.code.slice(0, 3)}-${r.code.slice(3, 7)}-${r.code.slice(7)}`, r.size, r.label, r.uses, r.maxUses, r.expiresAt ? new Date(r.expiresAt).toISOString() : "", r.revokedAt ? new Date(r.revokedAt).toISOString() : "", r.redeemedBy, r.booths, new Date(r.createdAt).toISOString()])));
  }
  const { page, size: ps, skip, take } = pageParams(url, 50);
  const [[{ total }], rows, [sums]] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(t).where(where),
    db.select(cols).from(t).where(where).orderBy(desc(t.createdAt)).limit(take).offset(skip),
    db.select({ open: sql<number>`coalesce(sum(case when revoked_at is null and uses < max_uses and (expires_at is null or expires_at > ${now()}) then max_uses - uses else 0 end),0)`, redeemed: sql<number>`coalesce(sum(uses),0)` }).from(t),
  ]);
  return NextResponse.json({ ...paged(rows, Number(total), page, ps), open: Number(sums.open), redeemed: Number(sums.redeemed) });
}

/** POST { size, count, label?, maxUses?, expiresDays? } → generate codes */
export async function POST(req: Request) {
  const g = await guard("codes"); if (g instanceof NextResponse) return g;
  await ensureMigrated();
  const b = await readJson<{ size?: string; count?: number; label?: string; maxUses?: number; expiresDays?: number }>(req);
  const size = String(b.size ?? "");
  if (size !== "any" && !(size in BOOTH_SIZES)) return bad("Pick a booth size");
  const count = Math.min(500, Math.max(1, int(b.count, 1)));
  const maxUses = Math.min(10000, Math.max(1, int(b.maxUses, 1)));
  const days = int(b.expiresDays, 0);
  const expiresAt = days > 0 ? now() + days * 86_400_000 : null;
  const label = optStr(b.label, 80);
  const made: string[] = [];
  for (let i = 0; i < count; i++) {
    let code = makeCode();
    for (let tries = 0; tries < 5; tries++) { const [dup] = await db.select({ id: schema.boothCodes.id }).from(schema.boothCodes).where(eq(schema.boothCodes.code, code)); if (!dup) break; code = makeCode(); }
    await db.insert(schema.boothCodes).values({ id: newId(), code, size, label, maxUses, uses: 0, expiresAt, createdBy: g.id, createdAt: now(), revokedAt: null });
    made.push(code);
  }
  await audit(g.id, "codes.generate", "booth_code", made[0] ?? "", undefined, { count, size, label, maxUses, expiresAt }, g.email);
  return NextResponse.json({ ok: true, codes: made.map((c) => `${c.slice(0, 3)}-${c.slice(3, 7)}-${c.slice(7)}`) });
}

/** PATCH { id, revoked: boolean } */
export async function PATCH(req: Request) {
  const g = await guard("codes"); if (g instanceof NextResponse) return g;
  const b = await readJson<{ id?: string; revoked?: boolean }>(req);
  if (!b.id) return bad("id required");
  await db.update(schema.boothCodes).set({ revokedAt: b.revoked === false ? null : now() }).where(eq(schema.boothCodes.id, b.id));
  await audit(g.id, b.revoked === false ? "codes.restore" : "codes.revoke", "booth_code", b.id, undefined, undefined, g.email);
  return NextResponse.json({ ok: true });
}
