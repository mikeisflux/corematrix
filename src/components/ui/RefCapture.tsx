"use client";
import { useEffect } from "react";
/** Remember a referral code from ?ref= until the visitor signs up. */
export function RefCapture() {
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) {
      try { localStorage.setItem("aoc_ref", ref.toUpperCase()); } catch { /* ignore */ }
    }
  }, []);
  return null;
}
