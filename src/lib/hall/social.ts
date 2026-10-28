"use client";
/**
 * People-to-people state on the client: speech bubbles over avatars, private
 * message threads, the guest's display name, and the emote/reaction the player
 * just fired (picked up by the next presence report). Plain object + version,
 * read every frame by the scene and subscribed to by panels.
 */
import { useSyncExternalStore } from "react";
import type { DmMessage } from "@/lib/dm";

export interface Bubble { text: string; until: number }
export const social = {
  friendsVersion: 0, // bumps when a friend request arrives or is answered, so open panels refetch

  bubbles: new Map<string, Bubble>(),
  reactions: new Map<string, { k: string; until: number }>(),
  pending: { e: null as { n: string; t: number } | null, r: null as { k: string; t: number } | null, dirty: false },
  dm: { threads: [] as { with: string; name: string; last: DmMessage; unread: number }[], active: null as { id: string; name: string } | null, messages: [] as DmMessage[], unread: 0, me: "" },
  version: 0,
};
const listeners = new Set<() => void>();
export function bumpSocial() { social.version++; for (const l of listeners) l(); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useSocial() { useSyncExternalStore(subscribe, () => social.version, () => 0); return social; }

export const REACTIONS = ["👋", "❤️", "😂", "🔥", "👏", "🎉", "😮", "👍"] as const;

export function guestName(): string { try { return (localStorage.getItem("fcc_name") || "").trim().slice(0, 24); } catch { return ""; } }
export function setGuestName(n: string) { try { localStorage.setItem("fcc_name", n.trim().slice(0, 24)); } catch {} social.pending.dirty = true; bumpSocial(); }

/** The player plays an emote and tells everyone through the next presence report. */
export function fireEmote(name: string) { social.pending.e = { n: name, t: Date.now() }; social.pending.dirty = true; bumpSocial(); }
export function fireReaction(k: string) { social.pending.r = { k, t: Date.now() }; social.reactions.set("me", { k, until: Date.now() + 3000 }); social.pending.dirty = true; bumpSocial(); }
export function showBubble(playerId: string, text: string, ms = 7000) { social.bubbles.set(playerId, { text: text.slice(0, 140), until: Date.now() + ms }); bumpSocial(); }
