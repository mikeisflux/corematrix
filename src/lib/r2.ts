/**
 * Cloudflare R2 through its S3 API, with no SDK: a SigV4 signer over fetch. Uploaded images (booth art, logos) go
 * here when the Storage settings are filled in and switched on; before that, and whenever R2 is off, they stay in
 * the database exactly as before. A stored reference is "r2:<key>"; `fileUrl` turns it into the public bucket URL
 * (R2_PUBLIC_URL: an r2.dev subdomain or a custom domain with a CORS rule for this site) or, with no public URL,
 * into /api/f/<key>, which streams the object through the server.
 */
import { createHash, createHmac } from "node:crypto";
import { getSettings } from "@/lib/settings";

export interface R2Config { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicUrl: string; enabled: boolean; endpoint: string }
export const R2_KEYS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL", "R2_ENABLED", "R2_ENDPOINT"] as const;

/** The settings as entered, whether or not they are complete; `r2Ready` is the one to gate uploads on. */
export async function r2Config(): Promise<R2Config> {
  const s = await getSettings([...R2_KEYS]);
  return { accountId: s.R2_ACCOUNT_ID, accessKeyId: s.R2_ACCESS_KEY_ID, secretAccessKey: s.R2_SECRET_ACCESS_KEY, bucket: s.R2_BUCKET, publicUrl: s.R2_PUBLIC_URL.replace(/\/+$/, ""), enabled: /^(true|1|yes|on)$/i.test(s.R2_ENABLED), endpoint: s.R2_ENDPOINT.replace(/\/+$/, "") };
}
export const r2Complete = (c: R2Config) => !!(c.accountId && c.accessKeyId && c.secretAccessKey && c.bucket);
/** Uploads go to R2 only when every credential is in and the switch is on. */
export async function r2Ready(): Promise<R2Config | null> { const c = await r2Config(); return c.enabled && r2Complete(c) ? c : null; }
/** Reads work whenever the credentials are in, switch or no switch: turning uploads off must never hide what is already on R2. */
/**
 * Whether the bucket's public host answers at all (any HTTP status below 500 counts; no DNS, no TLS or a Cloudflare
 * error page does not). Checked at most every five minutes while it is up and every minute while it is down, so a
 * public URL that is set before its domain is connected does not break every image: until it answers, images are
 * streamed through the server as if no public URL were set, and switch to the direct link by themselves afterwards.
 */
const alive = { url: "", ok: false, at: 0 };
export async function publicUrlAlive(url: string): Promise<boolean> {
  const now = Date.now();
  if (alive.url === url && now - alive.at < (alive.ok ? 300_000 : 60_000)) return alive.ok;
  let ok = false;
  try { const r = await fetch(`${url}/`, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(3000) }); ok = r.status < 500; } catch { ok = false; }
  alive.url = url; alive.ok = ok; alive.at = now;
  return ok;
}
/** The configuration to serve files with: complete keys, and the public URL only while its host answers. */
export async function r2Readable(): Promise<R2Config | null> {
  const c = await r2Config(); if (!r2Complete(c)) return null;
  if (c.publicUrl && !(await publicUrlAlive(c.publicUrl))) return { ...c, publicUrl: "" };
  return c;
}

const sha256 = (d: string | Uint8Array) => createHash("sha256").update(d).digest("hex");
const hmac = (k: string | Buffer, d: string) => createHmac("sha256", k).update(d).digest();
const encodeKey = (key: string) => key.split("/").map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)).join("/");

/** AWS Signature Version 4 for one request (host-style or path-style; the caller decides the path). Exported for the self-test. */
export function signV4(o: { method: string; host: string; path: string; region: string; service?: string; accessKeyId: string; secretAccessKey: string; headers?: Record<string, string>; payloadHash: string; date?: Date }) {
  const service = o.service ?? "s3";
  const now = o.date ?? new Date();
  const amz = now.toISOString().replace(/[:-]|\.\d{3}/g, ""), day = amz.slice(0, 8);
  const headers: Record<string, string> = { host: o.host, "x-amz-content-sha256": o.payloadHash, "x-amz-date": amz, ...Object.fromEntries(Object.entries(o.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v.trim()])) };
  const names = Object.keys(headers).sort();
  const canonical = [o.method, o.path, "", ...names.map((h) => `${h}:${headers[h]}`), "", names.join(";"), o.payloadHash].join("\n");
  const scope = `${day}/${o.region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amz, scope, sha256(canonical)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${o.secretAccessKey}`, day), o.region), service), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(toSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${o.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`;
  const { host: _h, ...send } = headers; void _h;
  return { authorization, headers: { ...send, authorization }, signature, canonical };
}

/** One signed request to the bucket. Keys are plain paths (art/12/wide-1700000000.jpg). */
export async function r2Request(cfg: R2Config, method: "PUT" | "GET" | "DELETE" | "HEAD", key: string, body?: Uint8Array, contentType?: string, extra?: Record<string, string>): Promise<Response> {
  // R2's S3 endpoint by default; R2_ENDPOINT (https://host[:port]) points at another S3-compatible store or a local mock
  const base = cfg.endpoint || `https://${cfg.accountId}.r2.cloudflarestorage.com`;
  const u = new URL(base);
  const path = `/${cfg.bucket}/${encodeKey(key)}`;
  const payloadHash = body ? sha256(body) : sha256("");
  const headers: Record<string, string> = { ...(contentType ? { "content-type": contentType } : {}), ...(extra ?? {}) };
  const signed = signV4({ method, host: u.host, path, region: "auto", accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, headers, payloadHash });
  return fetch(`${u.origin}${path}`, { method, headers: signed.headers, body: body ? new Uint8Array(body) : undefined, signal: AbortSignal.timeout(30_000) });
}

/** Store bytes under a key; returns the reference to keep ("r2:<key>"). Objects are immutable (the key carries a version). */
export async function r2Put(cfg: R2Config, key: string, body: Uint8Array, contentType: string): Promise<string> {
  const r = await r2Request(cfg, "PUT", key, body, contentType, { "cache-control": "public, max-age=31536000, immutable" });
  if (!r.ok) throw new Error(`R2 upload failed (${r.status}): ${(await r.text().catch(() => "")).slice(0, 200)}`);
  return `r2:${key}`;
}
export async function r2Get(cfg: R2Config, key: string): Promise<{ body: Uint8Array; type: string } | null> {
  const r = await r2Request(cfg, "GET", key);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`R2 read failed (${r.status})`);
  return { body: new Uint8Array(await r.arrayBuffer()), type: r.headers.get("content-type") || "application/octet-stream" };
}
export async function r2Delete(cfg: R2Config, key: string): Promise<void> { await r2Request(cfg, "DELETE", key).catch(() => {}); }

export const isRef = (v: string | null | undefined): v is string => typeof v === "string" && v.startsWith("r2:");
export const refKey = (ref: string) => ref.slice(3);
/** Where a browser fetches a stored reference: the public bucket URL, or the server proxy when none is set. */
export function fileUrl(ref: string, cfg: R2Config | null): string {
  const key = refKey(ref);
  return cfg?.publicUrl ? `${cfg.publicUrl}/${encodeKey(key)}` : `/api/f/${encodeKey(key)}`;
}
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
export const extFor = (mime: string) => EXT[mime] ?? "bin";
/** A versioned key so a replaced image never serves stale from any cache. */
export const artKey = (boothId: number, slot: string, mime: string, version: number) => `art/${boothId}/${slot.replace(/[^a-z0-9]+/gi, "-")}-${version}.${extFor(mime)}`;
export const logoKey = (boothId: number, mime: string, version: number) => `logo/${boothId}-${version}.${extFor(mime)}`;
/** Upload a data URL (image/*) and return its reference, or the data URL unchanged when R2 is off or the upload fails softly. */
export async function offloadDataUrl(dataUrl: string, key: (mime: string) => string): Promise<string> {
  const cfg = await r2Ready(); if (!cfg) return dataUrl;
  const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl); if (!m) return dataUrl;
  return r2Put(cfg, key(m[1]), Buffer.from(m[2], "base64"), m[1]);
}
