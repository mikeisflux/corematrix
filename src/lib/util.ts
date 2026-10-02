import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
export const newId = customAlphabet(alphabet, 16);
export const newToken = customAlphabet(alphabet + "ABCDEFGHIJKLMNOPQRSTUVWXYZ", 40);
export const newCode = customAlphabet("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 7);

export const now = () => Date.now();
export const dayKey = (ts = Date.now()) => new Date(ts).toISOString().slice(0, 10);
export const daysAgoKey = (n: number) => dayKey(Date.now() - n * 86_400_000);

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function clampStr(s: string | null | undefined, max: number): string {
  if (!s) return "";
  const t = s.trim();
  return t.length > max ? t.slice(0, max) : t;
}

export function normalizeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  let s = u.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const url = new URL(s);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function hostOf(u: string | null | undefined): string {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

export function isHexColor(c: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(c);
}

export function weekId(ts = Date.now()): string {
  const d = new Date(ts);
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(utc.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((utc.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function weekBounds(ts = Date.now()): { startsAt: number; endsAt: number } {
  const d = new Date(ts);
  const day = d.getUTCDay() || 7;
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (day - 1));
  return { startsAt: start, endsAt: start + 7 * 86_400_000 };
}

/** Deterministic pseudo-random in [0,1) from a seed, for procedural visuals. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
