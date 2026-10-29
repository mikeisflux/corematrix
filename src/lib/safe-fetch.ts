/**
 * Fetch a user-supplied URL from the server without letting it reach the server's own network: the host must
 * resolve only to public addresses, redirects are not followed, and the body is read up to a byte cap.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return privateAddress(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb");
}

export async function fetchPublic(url: string, opts: { timeoutMs?: number; maxBytes?: number } = {}): Promise<{ type: string; body: Buffer } | null> {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => privateAddress(a.address))) return null;
  const r = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(opts.timeoutMs ?? 4000) }).catch(() => null);
  if (!r || !r.ok || !r.body) return null;
  const max = opts.maxBytes ?? 2_000_000;
  if (Number(r.headers.get("content-length") ?? 0) > max) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  const reader = r.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  return { type: r.headers.get("content-type") ?? "", body: Buffer.concat(chunks) };
}
