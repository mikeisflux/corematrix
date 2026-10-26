/**
 * Performance sessions: the hall posts 1-second frame buckets; we keep them
 * per visit with a summary so a slow machine can be diagnosed from the admin
 * page (or a pasted report) without guessing.
 */
import { desc, eq, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { now } from "@/lib/util";
import { verdict, type PerfBucket, type PerfDevice } from "@/lib/hall/perf";

export const MAX_SAMPLES = 900; // 15 minutes at one bucket a second
export type PerfSession = typeof schema.perfSessions.$inferSelect;
export interface PerfSummary {
  durationS: number; frames: number; avgFps: number; minFps: number; p95ms: number; worstMs: number; longFrames: number;
  avgCalls: number; maxCalls: number; avgTris: number; quality: Record<string, number>; modes: Record<string, number>; dpr: number;
  avgCpu: number; avgRender: number;
}

export function summarize(samples: PerfBucket[]): PerfSummary {
  if (samples.length === 0) return { durationS: 0, frames: 0, avgFps: 0, minFps: 0, p95ms: 0, worstMs: 0, longFrames: 0, avgCalls: 0, maxCalls: 0, avgTris: 0, quality: {}, modes: {}, dpr: 1, avgCpu: 0, avgRender: 0 };
  const frames = samples.reduce((a, b) => a + b.f, 0);
  // wall-clock span: a frame longer than a second leaves gaps between buckets
  const secs = Math.max(samples.length, samples[samples.length - 1].t - samples[0].t + 1);
  const p95s = samples.map((b) => b.p95).sort((a, b) => a - b);
  const quality: Record<string, number> = {}, modes: Record<string, number> = {};
  for (const b of samples) { quality[b.q] = (quality[b.q] ?? 0) + 1; modes[b.mode] = (modes[b.mode] ?? 0) + 1; }
  return {
    durationS: secs,
    frames,
    avgFps: Math.round((frames / secs) * 10) / 10,
    minFps: Math.min(...samples.map((b) => b.f)),
    p95ms: Math.round(p95s[Math.floor(p95s.length * 0.95)] * 10) / 10,
    worstMs: Math.round(Math.max(...samples.map((b) => b.max)) * 10) / 10,
    longFrames: samples.reduce((a, b) => a + b.long, 0),
    avgCalls: Math.round(samples.reduce((a, b) => a + b.calls, 0) / samples.length),
    maxCalls: Math.max(...samples.map((b) => b.calls)),
    avgTris: Math.round(samples.reduce((a, b) => a + b.tris, 0) / samples.length),
    quality, modes,
    dpr: samples[samples.length - 1].dpr,
    avgCpu: Math.round((samples.reduce((a, b) => a + (b.cpu ?? 0), 0) / samples.length) * 10) / 10,
    avgRender: Math.round((samples.reduce((a, b) => a + (b.rend ?? 0), 0) / samples.length) * 10) / 10,
  };
}

/** Append buckets to a session (creating it on first contact). The visitor cookie must match. */
export async function appendPerf(input: { id: string; visitorId: string; userId: string | null; label?: string | null; url?: string | null; device: PerfDevice; samples: PerfBucket[] }) {
  await ensureMigrated();
  const [row] = await db.select().from(schema.perfSessions).where(eq(schema.perfSessions.id, input.id)).limit(1);
  const t = now();
  if (row) {
    if (row.visitorId !== input.visitorId) throw new Error("Not your session");
    const all = ([...(JSON.parse(row.samples) as PerfBucket[]), ...input.samples]).slice(-MAX_SAMPLES);
    await db.update(schema.perfSessions).set({ samples: JSON.stringify(all), summary: JSON.stringify(summarize(all)), updatedAt: t, ...(input.label ? { label: input.label } : {}), ...(input.userId ? { userId: input.userId } : {}) }).where(eq(schema.perfSessions.id, input.id));
    return;
  }
  const samples = input.samples.slice(-MAX_SAMPLES);
  await db.insert(schema.perfSessions).values({ id: input.id, visitorId: input.visitorId, userId: input.userId, label: input.label ?? null, url: input.url ?? null, device: JSON.stringify(input.device), summary: JSON.stringify(summarize(samples)), samples: JSON.stringify(samples), startedAt: t, updatedAt: t });
}

export async function listPerf(page = 1, size = 40) {
  await ensureMigrated();
  const [[{ total }], rows] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(schema.perfSessions),
    db.select({ id: schema.perfSessions.id, userId: schema.perfSessions.userId, label: schema.perfSessions.label, url: schema.perfSessions.url, device: schema.perfSessions.device, summary: schema.perfSessions.summary, startedAt: schema.perfSessions.startedAt, updatedAt: schema.perfSessions.updatedAt, email: schema.users.email })
      .from(schema.perfSessions).leftJoin(schema.users, eq(schema.users.id, schema.perfSessions.userId)).orderBy(desc(schema.perfSessions.startedAt)).limit(size).offset((page - 1) * size),
  ]);
  return { rows: rows.map((r) => ({ ...r, device: JSON.parse(r.device) as PerfDevice, summary: JSON.parse(r.summary) as PerfSummary })), total: Number(total), page, pages: Math.max(1, Math.ceil(Number(total) / size)) };
}

/** Every session with its samples, newest first (the admin "Export all" download). */
export async function exportPerf(limit = 500) {
  await ensureMigrated();
  const rows = await db.select().from(schema.perfSessions).orderBy(desc(schema.perfSessions.startedAt)).limit(limit);
  return rows.map((r) => ({ ...r, device: JSON.parse(r.device) as PerfDevice, summary: JSON.parse(r.summary) as PerfSummary, samples: JSON.parse(r.samples) as PerfBucket[] }));
}

export async function getPerf(id: string) {
  await ensureMigrated();
  const [r] = await db.select().from(schema.perfSessions).where(eq(schema.perfSessions.id, id)).limit(1);
  if (!r) return null;
  return { ...r, device: JSON.parse(r.device) as PerfDevice, summary: JSON.parse(r.summary) as PerfSummary, samples: JSON.parse(r.samples) as PerfBucket[] };
}

/** A compact text report that fits in a chat message: device, summary, and a downsampled timeline. */
export function perfReport(s: NonNullable<Awaited<ReturnType<typeof getPerf>>>): string {
  const d = s.device, m = s.summary;
  const pct = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k} ${Math.round((v / Math.max(1, m.durationS)) * 100)}%`).join(", ");
  const lines = [
    `ForeverComicCon performance session ${s.id}${s.label ? ` (${s.label})` : ""}`,
    `started ${new Date(s.startedAt).toISOString()} · ${m.durationS}s · url ${s.url ?? "-"}`,
    `GPU: ${d.gpu} (${d.vendor}) · cores ${d.cores} · memory ${d.memory ?? "?"} GB · screen ${d.screen} · viewport ${d.viewport} · dpr ${d.dpr} · touch ${d.touch}`,
    `UA: ${d.ua}`,
    `fps avg ${m.avgFps} min ${m.minFps} · frame p95 ${m.p95ms} ms worst ${m.worstMs} ms · long frames (>50 ms) ${m.longFrames} of ${m.frames}`,
    `draw calls avg ${m.avgCalls} max ${m.maxCalls} · triangles avg ${m.avgTris.toLocaleString("en-US")} · render dpr ${m.dpr}`,
    `main thread ${m.avgCpu} ms per frame, of which renderer.render ${m.avgRender} ms → ${verdict(m.avgCpu, m.avgFps)}`,
    `quality: ${pct(m.quality)} · mode: ${pct(m.modes)}`,
    "timeline (t s: fps / p95 ms / cpu ms / render ms / calls / quality / mode / npcs):",
  ];
  const step = Math.max(1, Math.ceil(s.samples.length / 60));
  for (let i = 0; i < s.samples.length; i += step) {
    const b = s.samples[i];
    lines.push(`  ${String(b.t).padStart(4)}: ${String(b.f).padStart(3)} / ${b.p95.toFixed(1).padStart(6)} / ${String(b.cpu ?? "-").padStart(5)} / ${String(b.rend ?? "-").padStart(5)} / ${String(b.calls).padStart(4)} / ${b.q} / ${b.mode} / ${b.npc}`);
  }
  return lines.join("\n");
}
