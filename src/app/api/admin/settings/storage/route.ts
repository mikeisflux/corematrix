import { NextResponse } from "next/server";
import { and, eq, isNull, like, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { audit } from "@/lib/auth";
import { artKey, logoKey, r2Complete, r2Config, r2Delete, r2Get, r2Put, r2Ready, fileUrl, isRef, refKey } from "@/lib/r2";
import { siteUrl } from "@/lib/settings";
import { guard, bad, readJson } from "../../_lib";

export const dynamic = "force-dynamic";

/** What is where: uploads still in the database and uploads already on R2. */
async function status() {
  await ensureMigrated();
  const [art] = await db.select({ inDb: sql<number>`sum(case when ${schema.boothArt.url} is null then 1 else 0 end)`, dbBytes: sql<number>`sum(case when ${schema.boothArt.url} is null then length(${schema.boothArt.data}) else 0 end)`, onR2: sql<number>`sum(case when ${schema.boothArt.url} is not null then 1 else 0 end)` }).from(schema.boothArt);
  const [logos] = await db.select({ inDb: sql<number>`sum(case when ${schema.booths.logoUrl} like 'data:%' then 1 else 0 end)`, dbBytes: sql<number>`sum(case when ${schema.booths.logoUrl} like 'data:%' then length(${schema.booths.logoUrl}) else 0 end)`, onR2: sql<number>`sum(case when ${schema.booths.logoUrl} like 'r2:%' then 1 else 0 end)` }).from(schema.booths);
  const cfg = await r2Config();
  const n = (v: unknown) => Number(v ?? 0);
  // base64 is 4/3 the size of the bytes it carries
  return { art: { inDb: n(art?.inDb), dbMB: +((n(art?.dbBytes) * 0.75) / 1e6).toFixed(1), onR2: n(art?.onR2) }, logos: { inDb: n(logos?.inDb), dbMB: +((n(logos?.dbBytes) * 0.75) / 1e6).toFixed(1), onR2: n(logos?.onR2) }, configured: r2Complete(cfg), enabled: cfg.enabled, publicUrl: cfg.publicUrl, bucket: cfg.bucket };
}

export async function GET() {
  const g = await guard("settings"); if (g instanceof NextResponse) return g;
  return NextResponse.json(await status());
}

/** test: write, read back, check CORS on the public URL, delete. migrate: move a batch of database images to R2. restore: bring a batch back into the database (for leaving R2). */
export async function POST(req: Request) {
  const g = await guard("settings"); if (g instanceof NextResponse) return g;
  const b = await readJson<{ action?: string; batch?: number }>(req);
  const cfg = await r2Config();
  if (!r2Complete(cfg)) return bad("Fill in the account id, access key id, secret access key and bucket first.");
  if (b.action === "test") {
    const steps: Array<{ name: string; ok: boolean | null; detail: string }> = [];
    const key = `art/_probe/${Date.now()}.txt`;
    const body = new TextEncoder().encode("forevercomiccon storage probe");
    try { await r2Put(cfg, key, body, "text/plain"); steps.push({ name: "Write an object", ok: true, detail: key }); }
    catch (e) { steps.push({ name: "Write an object", ok: false, detail: (e as Error).message }); return NextResponse.json({ ok: false, steps }); }
    try { const got = await r2Get(cfg, key); steps.push({ name: "Read it back", ok: !!got && got.body.length === body.length, detail: got ? `${got.body.length} bytes, ${got.type}` : "not found" }); }
    catch (e) { steps.push({ name: "Read it back", ok: false, detail: (e as Error).message }); }
    if (cfg.publicUrl) {
      const origin = await siteUrl().catch(() => "");
      try {
        const r = await fetch(fileUrl(`r2:${key}`, cfg), { headers: origin ? { Origin: origin } : {}, signal: AbortSignal.timeout(15_000) });
        const acao = r.headers.get("access-control-allow-origin");
        steps.push({ name: "Public URL serves it", ok: r.ok, detail: r.ok ? `${r.status} from ${cfg.publicUrl}` : `${r.status}: is the bucket public (r2.dev) or the custom domain connected?` });
        steps.push({ name: "CORS for the hall's textures", ok: r.ok ? !!acao && (acao === "*" || acao === origin) : null, detail: acao ? `Access-Control-Allow-Origin: ${acao}` : `No Access-Control-Allow-Origin header. In R2 → bucket → Settings → CORS policy allow GET and HEAD from ${origin || "the site"}; without it the floor cannot use the images as 3D textures (the storefront still shows them).` });
      } catch (e) {
        // "fetch failed" is Node for "no such host / no TLS": the r2.dev URL is not enabled yet, or the custom domain has no DNS
        const why = (e as Error).message;
        steps.push({ name: "Public URL serves it", ok: false, detail: `${cfg.publicUrl} did not answer (${why}). An r2.dev address only works once "Public Development URL" is enabled in R2 → bucket → Settings (copy the pub-….r2.dev address it shows); a custom domain only once it is added under "Custom Domains" there and shows Active. Until it answers, images are streamed through the server instead, so nothing is missing on the floor.` });
      }
    } else steps.push({ name: "Public URL", ok: null, detail: "None set: images will be streamed through the server at /api/f/… (works everywhere, costs server bandwidth). Set R2_PUBLIC_URL to serve them from Cloudflare directly." });
    await r2Delete(cfg, key); steps.push({ name: "Delete it", ok: true, detail: "cleaned up" });
    await audit(g.id, "storage.test", "setting", "R2", undefined, { ok: steps.every((s) => s.ok !== false) }, g.email);
    return NextResponse.json({ ok: steps.every((s) => s.ok !== false), steps });
  }
  if (b.action === "migrate") {
    if (!(await r2Ready())) return bad("Switch R2_ENABLED to true first, so new uploads and moved files land in the same place.");
    const batch = Math.min(50, Math.max(1, Number(b.batch) || 20));
    let moved = 0; const errors: string[] = [];
    const artRows = await db.select().from(schema.boothArt).where(isNull(schema.boothArt.url)).limit(batch);
    for (const r of artRows) {
      try { const ref = await r2Put(cfg, artKey(r.boothId, r.slot, r.mime, r.updatedAt), Buffer.from(r.data, "base64"), r.mime); await db.update(schema.boothArt).set({ url: ref, data: "" }).where(and(eq(schema.boothArt.boothId, r.boothId), eq(schema.boothArt.slot, r.slot))); moved++; }
      catch (e) { errors.push(`art ${r.boothId}/${r.slot}: ${(e as Error).message}`); }
    }
    if (artRows.length < batch) {
      const logoRows = await db.select({ id: schema.booths.id, logoUrl: schema.booths.logoUrl, updatedAt: schema.booths.updatedAt }).from(schema.booths).where(like(schema.booths.logoUrl, "data:%")).limit(batch - artRows.length);
      for (const r of logoRows) {
        const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(r.logoUrl ?? "");
        if (!m) { errors.push(`logo ${r.id}: not an image data URL`); continue; }
        try { const ref = await r2Put(cfg, logoKey(r.id, m[1], r.updatedAt ?? Date.now()), Buffer.from(m[2], "base64"), m[1]); await db.update(schema.booths).set({ logoUrl: ref }).where(eq(schema.booths.id, r.id)); moved++; }
        catch (e) { errors.push(`logo ${r.id}: ${(e as Error).message}`); }
      }
    }
    const st = await status();
    const remaining = st.art.inDb + st.logos.inDb;
    if (moved) await audit(g.id, "storage.migrate", "setting", "R2", undefined, { moved, remaining }, g.email);
    return NextResponse.json({ moved, remaining, errors: errors.slice(0, 5), status: st });
  }
  if (b.action === "restore") {
    const batch = Math.min(50, Math.max(1, Number(b.batch) || 20));
    let moved = 0; const errors: string[] = [];
    const artRows = await db.select().from(schema.boothArt).where(sql`${schema.boothArt.url} like 'r2:%'`).limit(batch);
    for (const r of artRows) {
      try { const obj = await r2Get(cfg, refKey(r.url!)); if (!obj) throw new Error("object missing on R2"); await db.update(schema.boothArt).set({ url: null, data: Buffer.from(obj.body).toString("base64") }).where(and(eq(schema.boothArt.boothId, r.boothId), eq(schema.boothArt.slot, r.slot))); moved++; }
      catch (e) { errors.push(`art ${r.boothId}/${r.slot}: ${(e as Error).message}`); }
    }
    if (artRows.length < batch) {
      const logoRows = await db.select({ id: schema.booths.id, logoUrl: schema.booths.logoUrl }).from(schema.booths).where(like(schema.booths.logoUrl, "r2:%")).limit(batch - artRows.length);
      for (const r of logoRows) {
        try { const obj = await r2Get(cfg, refKey(r.logoUrl!)); if (!obj) throw new Error("object missing on R2"); await db.update(schema.booths).set({ logoUrl: `data:${/^image\//.test(obj.type) ? obj.type : "image/png"};base64,${Buffer.from(obj.body).toString("base64")}` }).where(eq(schema.booths.id, r.id)); moved++; }
        catch (e) { errors.push(`logo ${r.id}: ${(e as Error).message}`); }
      }
    }
    const st = await status();
    const remaining = st.art.onR2 + st.logos.onR2;
    if (moved) await audit(g.id, "storage.restore", "setting", "R2", undefined, { moved, remaining }, g.email);
    return NextResponse.json({ moved, remaining, errors: errors.slice(0, 5), status: st });
  }
  return bad("unknown action");
}
