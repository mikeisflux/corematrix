/**
 * Small in-memory sliding-window limiter, shared across routes in one process.
 * `allow("track:" + visitor, 240, 60_000)` is true while the key has used fewer
 * than 240 hits in the last minute. Old keys are pruned so the map can't grow
 * without bound.
 */
const g = globalThis as unknown as { __fccThrottle?: Map<string, number[]>; __fccThrottlePruned?: number };
const hits = (g.__fccThrottle ??= new Map<string, number[]>());

export function allow(key: string, max: number, windowMs: number): boolean {
  const t = Date.now();
  if (t - (g.__fccThrottlePruned ?? 0) > 60_000) {
    g.__fccThrottlePruned = t;
    for (const [k, v] of hits) if (!v.length || t - v[v.length - 1] > 10 * 60_000) hits.delete(k);
  }
  const list = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
  if (list.length >= max) { hits.set(key, list); return false; }
  list.push(t);
  hits.set(key, list);
  return true;
}
