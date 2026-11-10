"use client";
/** The portfolio book: which booth's is open on screen, and the spread being read. Opened by the book on the table, a print on the wall, or the storefront. */
import { useSyncExternalStore } from "react";

export const portfolio = { boothId: null as number | null, page: 0, version: 0 };
const listeners = new Set<() => void>();
function bump() { portfolio.version++; for (const l of listeners) l(); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function usePortfolio() { useSyncExternalStore(subscribe, () => portfolio.version, () => 0); return portfolio; }
/** Open a booth's portfolio at a piece (the spread that holds it). */
export function openPortfolio(boothId: number, piece = 0) { portfolio.boothId = boothId; portfolio.page = Math.max(0, Math.floor(piece / 2)); bump(); }
export function turnPortfolio(delta: number, max: number) { portfolio.page = Math.max(0, Math.min(max, portfolio.page + delta)); bump(); }
export function closePortfolio() { if (portfolio.boothId === null) return; portfolio.boothId = null; portfolio.page = 0; bump(); }
