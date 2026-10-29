/**
 * Small in-memory sliding-window limiter, shared across routes in one process.
 * `allow("track:" + visitor, 240, 60_000)` is true while the key has used fewer
 * than 240 hits in the last minute. The hit is counted at once, before any await,
 * so parallel requests can't all slip past the check. Each key remembers its own
 * window, and keys are pruned only once that window has passed, so a 24-hour
 * limit really lasts 24 hours.
 */
const g = globalThis as unknown as { __fccThrottle2?: Map<string, { w: number; hits: number[] }>; __fccThrottlePruned?: number };
const keys = (g.__fccThrottle2 ??= new Map<string, { w: number; hits: number[] }>());

export function allow(key: string, max: number, windowMs: number): boolean {
  const t = Date.now();
  if (t - (g.__fccThrottlePruned ?? 0) > 60_000) {
    g.__fccThrottlePruned = t;
    for (const [k, v] of keys) if (!v.hits.length || t - v.hits[v.hits.length - 1] > v.w) keys.delete(k);
  }
  const entry = keys.get(key) ?? { w: windowMs, hits: [] };
  entry.w = Math.max(entry.w, windowMs);
  entry.hits = entry.hits.filter((x) => t - x < windowMs);
  if (entry.hits.length >= max) { keys.set(key, entry); return false; }
  entry.hits.push(t);
  keys.set(key, entry);
  return true;
}
