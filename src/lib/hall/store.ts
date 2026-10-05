"use client";
import { create } from "zustand";

export interface HallBooth {
  id: number;
  name: string | null;
  tagline: string | null;
  website: string | null;
  hasLogo: boolean;
  color: string;
  accent: string;
  style: string;
  cloth: string;
  category: string;
  size: string;
  kind: string;
  label: string;
  hall: string;
  tier: string;
  valueCents: number;
  totalViews: number;
  totalClicks: number;
  claimedAt: number | null;
  salesCount: number;
  views7d?: number;
  clicks7d?: number;
}

export interface HallEvent {
  id: string;
  type: string;
  boothId: number | null;
  title: string;
  detail: string | null;
  amountCents: number | null;
  createdAt: number;
}

export interface HallBillboard {
  id: string;
  slot: string;
  headline: string;
  body: string | null;
  website: string | null;
  imageUrl: string | null;
  color: string;
  boothId: number | null;
}

export interface Featured {
  id: number;
  name: string | null;
  tagline: string | null;
  reason: "winner" | "landmark";
  valueCents: number;
}

export interface HallStats {
  totalSalesCents: number;
  claimed: number;
  totalViews: number;
  totalBoothViews: number;
  totalImpressions: number;
  totalValueCents: number;
  online: number;
  totalBooths: number;
}

export interface Me {
  id: string;
  email: string;
  displayName: string | null;
  coins: number;
  streak: number;
  awardedToday: number;
  creditCents: number;
  referralCode: string;
  isAdmin: boolean;
  unread: number;
  avatar?: AvatarConfig | null;
}

interface HallState {
  booths: Map<number, HallBooth>;
  events: HallEvent[];
  billboards: HallBillboard[];
  featured: Featured[];
  stats: HallStats | null;
  me: Me | null;
  myBooths: Array<{ id: number; name: string | null; valueCents: number; tier: string; color: string }>;
  loaded: boolean;
  hovered: number | null;
  selected: number | null;
  panel: "none" | "booth" | "rankings" | "search" | "chat" | "claim" | "stats" | "arcade" | "billboards" | "me" | "avatar";
  night: boolean;
  ride: boolean;
  flyTo: number | null;
  toast: string | null;
  mode: "map" | "walk";
  avatar: AvatarConfig;
  walkTarget: number | null;
  near: number | null;
  previewDraft: { boothId: number; color: string; style: string; cloth: string; name: string } | null;
  setBooths: (p: HallBooth[]) => void;
  upsertBooth: (p: Partial<HallBooth> & { id: number }) => void;
  pushEvent: (e: HallEvent) => void;
  setStats: (s: Partial<HallStats>) => void;
  setMe: (m: Me | null, booths?: HallState["myBooths"]) => void;
  setHovered: (id: number | null) => void;
  select: (id: number | null) => void;
  setPanel: (p: HallState["panel"]) => void;
  toggleNight: () => void;
  setRide: (r: boolean) => void;
  setFlyTo: (id: number | null) => void;
  setToast: (t: string | null) => void;
  setPreview: (d: HallState["previewDraft"]) => void;
  setBillboards: (b: HallBillboard[]) => void;
  setFeatured: (f: Featured[]) => void;
  setMode: (m: HallState["mode"]) => void;
  setAvatar: (a: Partial<AvatarConfig>) => void;
  setWalkTarget: (id: number | null) => void;
  setNear: (id: number | null) => void;
}

export interface AvatarConfig {
  body: "a" | "b"; // a: broader shoulders, b: narrower shoulders / wider hips
  skin: string;
  hair: "short" | "long" | "buzz" | "bun" | "bald";
  hairColor: string;
  shirt: string;
  pants: string;
}
export const DEFAULT_AVATAR: AvatarConfig = { body: "a", skin: "#c68642", hair: "short", hairColor: "#2b1b12", shirt: "#e63946", pants: "#1f2a44" };
export const SKIN_TONES = ["#ffdbb4", "#f1c27d", "#e0ac69", "#c68642", "#a16e4b", "#8d5524", "#5c3a21", "#3b2314"];
export const HAIR_COLORS = ["#0b0b0b", "#2b1b12", "#5a3a1a", "#8b5a2b", "#b5651d", "#d8a657", "#f2e394", "#a0a0a0", "#ffffff", "#e63946", "#3a86ff", "#8338ec", "#06d6a0", "#ff6bd6"];
export const OUTFIT_COLORS = ["#e63946", "#f4a261", "#2a9d8f", "#3a86ff", "#8338ec", "#ff006e", "#ffd166", "#111827", "#f8f9fa", "#1f2a44", "#5c4b51", "#06d6a0"];

export const useHall = create<HallState>((set) => ({
  booths: new Map(),
  events: [],
  billboards: [],
  featured: [],
  stats: null,
  me: null,
  myBooths: [],
  loaded: false,
  hovered: null,
  selected: null,
  panel: "none",
  night: false,
  ride: false,
  flyTo: null,
  toast: null,
  mode: "map",
  avatar: DEFAULT_AVATAR,
  walkTarget: null,
  near: null,
  previewDraft: null,
  setBooths: (booths) => set({ booths: new Map(booths.map((p) => [p.id, p])), loaded: true }),
  upsertBooth: (p) =>
    set((s) => {
      const next = new Map(s.booths);
      const prev = next.get(p.id);
      next.set(p.id, { ...(prev ?? emptyBooth(p.id)), ...p });
      return { booths: next };
    }),
  pushEvent: (e) => set((s) => ({ events: [e, ...s.events.filter((x) => x.id !== e.id)].slice(0, 60) })),
  setStats: (st) => set((s) => ({ stats: { ...(s.stats ?? emptyStats()), ...st } })),
  setMe: (me, booths) => set({ me, myBooths: booths ?? [] }),
  setHovered: (hovered) => set({ hovered }),
  select: (selected) => set({ selected, panel: selected ? "booth" : "none" }),
  setPanel: (panel) => set({ panel }),
  toggleNight: () => set((s) => ({ night: !s.night })),
  setRide: (ride) => set({ ride }),
  setFlyTo: (flyTo) => set({ flyTo }),
  setToast: (toast) => set({ toast }),
  setPreview: (previewDraft) => set({ previewDraft }),
  setBillboards: (billboards) => set({ billboards }),
  setFeatured: (featured) => set({ featured }),
  setMode: (mode) => set({ mode }),
  setAvatar: (a) => set((s) => { const avatar = { ...s.avatar, ...a }; try { localStorage.setItem("aoc_avatar", JSON.stringify(avatar)); } catch {} return { avatar }; }),
  setWalkTarget: (walkTarget) => set({ walkTarget }),
  setNear: (near) => set({ near }),
}));

function emptyBooth(id: number): HallBooth {
  return { id, name: null, tagline: null, website: null, hasLogo: false, color: "#5b8def", accent: "#fff", style: "classic", cloth: "#111827", category: "comics", size: "10x10", kind: "exhibitor", label: String(id), hall: "A", tier: "free", valueCents: 0, totalViews: 0, totalClicks: 0, claimedAt: null, salesCount: 0 };
}
function emptyStats(): HallStats {
  return { totalSalesCents: 0, claimed: 0, totalViews: 0, totalBoothViews: 0, totalImpressions: 0, totalValueCents: 0, online: 0, totalBooths: 0 };
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j;
}

export function track(body: Record<string, unknown>) {
  const data = JSON.stringify(body);
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/track", new Blob([data], { type: "application/json" }));
  } else {
    void fetch("/api/track", { method: "POST", body: data, headers: { "Content-Type": "application/json" }, keepalive: true });
  }
}
