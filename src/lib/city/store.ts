"use client";
import { create } from "zustand";

export interface CityPlot {
  id: number;
  name: string | null;
  tagline: string | null;
  website: string | null;
  hasLogo: boolean;
  color: string;
  accent: string;
  style: string;
  shape: string;
  floors: number;
  roof: string;
  district: string;
  tier: string;
  valueCents: number;
  totalViews: number;
  totalClicks: number;
  claimedAt: number | null;
  salesCount: number;
  views7d?: number;
  clicks7d?: number;
}

export interface CityEvent {
  id: string;
  type: string;
  plotId: number | null;
  title: string;
  detail: string | null;
  amountCents: number | null;
  createdAt: number;
}

export interface CityBillboard {
  id: string;
  slot: string;
  headline: string;
  body: string | null;
  website: string | null;
  imageUrl: string | null;
  color: string;
  plotId: number | null;
}

export interface CityStats {
  totalSalesCents: number;
  claimed: number;
  totalViews: number;
  totalPlotViews: number;
  totalImpressions: number;
  totalValueCents: number;
  online: number;
  totalPlots: number;
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
}

interface CityState {
  plots: Map<number, CityPlot>;
  events: CityEvent[];
  billboards: CityBillboard[];
  stats: CityStats | null;
  me: Me | null;
  myPlots: Array<{ id: number; name: string | null; valueCents: number; tier: string; color: string }>;
  loaded: boolean;
  hovered: number | null;
  selected: number | null;
  panel: "none" | "plot" | "rankings" | "search" | "chat" | "claim" | "stats" | "arcade" | "billboards" | "me";
  night: boolean;
  ride: boolean;
  flyTo: number | null;
  toast: string | null;
  previewDraft: { plotId: number; floors: number; color: string; shape: string; style: string; roof: string } | null;
  setPlots: (p: CityPlot[]) => void;
  upsertPlot: (p: Partial<CityPlot> & { id: number }) => void;
  pushEvent: (e: CityEvent) => void;
  setStats: (s: Partial<CityStats>) => void;
  setMe: (m: Me | null, plots?: CityState["myPlots"]) => void;
  setHovered: (id: number | null) => void;
  select: (id: number | null) => void;
  setPanel: (p: CityState["panel"]) => void;
  toggleNight: () => void;
  setRide: (r: boolean) => void;
  setFlyTo: (id: number | null) => void;
  setToast: (t: string | null) => void;
  setPreview: (d: CityState["previewDraft"]) => void;
  setBillboards: (b: CityBillboard[]) => void;
}

export const useCity = create<CityState>((set) => ({
  plots: new Map(),
  events: [],
  billboards: [],
  stats: null,
  me: null,
  myPlots: [],
  loaded: false,
  hovered: null,
  selected: null,
  panel: "none",
  night: false,
  ride: false,
  flyTo: null,
  toast: null,
  previewDraft: null,
  setPlots: (plots) => set({ plots: new Map(plots.map((p) => [p.id, p])), loaded: true }),
  upsertPlot: (p) =>
    set((s) => {
      const next = new Map(s.plots);
      const prev = next.get(p.id);
      next.set(p.id, { ...(prev ?? emptyPlot(p.id)), ...p });
      return { plots: next };
    }),
  pushEvent: (e) => set((s) => ({ events: [e, ...s.events.filter((x) => x.id !== e.id)].slice(0, 60) })),
  setStats: (st) => set((s) => ({ stats: { ...(s.stats ?? emptyStats()), ...st } })),
  setMe: (me, plots) => set({ me, myPlots: plots ?? [] }),
  setHovered: (hovered) => set({ hovered }),
  select: (selected) => set({ selected, panel: selected ? "plot" : "none" }),
  setPanel: (panel) => set({ panel }),
  toggleNight: () => set((s) => ({ night: !s.night })),
  setRide: (ride) => set({ ride }),
  setFlyTo: (flyTo) => set({ flyTo }),
  setToast: (toast) => set({ toast }),
  setPreview: (previewDraft) => set({ previewDraft }),
  setBillboards: (billboards) => set({ billboards }),
}));

function emptyPlot(id: number): CityPlot {
  return { id, name: null, tagline: null, website: null, hasLogo: false, color: "#5b8def", accent: "#fff", style: "modern", shape: "tower", floors: 1, roof: "flat", district: "downtown", tier: "free", valueCents: 0, totalViews: 0, totalClicks: 0, claimedAt: null, salesCount: 0 };
}
function emptyStats(): CityStats {
  return { totalSalesCents: 0, claimed: 0, totalViews: 0, totalPlotViews: 0, totalImpressions: 0, totalValueCents: 0, online: 0, totalPlots: 0 };
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
