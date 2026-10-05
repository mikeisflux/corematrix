"use client";
import { useEffect } from "react";
import { useHall } from "@/lib/hall/store";

/** Deep links: /?booth=42 selects, /?claim=1 opens the claim flow, /?booth=42&takeover=1 opens a takeover. */
export function UrlActions() {
  const loaded = useHall((s) => s.loaded);
  useEffect(() => {
    if (!loaded) return;
    const sp = new URLSearchParams(window.location.search);
    const st = useHall.getState();
    if (sp.get("night") === "1" && !st.night) st.toggleNight();
    if (sp.get("mode") === "walk") st.setMode("walk");
    const booth = Number(sp.get("booth"));
    if (booth) {
      st.select(booth);
      st.setFlyTo(booth);
    } else if (sp.get("claim")) st.setPanel("claim");
    else if (sp.get("chat")) st.setPanel("chat");
    else if (sp.get("arcade")) st.setPanel("arcade");
  }, [loaded]);
  return null;
}
