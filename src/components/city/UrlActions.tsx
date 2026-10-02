"use client";
import { useEffect } from "react";
import { useCity } from "@/lib/city/store";

/** Deep links: /?plot=42 selects, /?claim=1 opens the claim flow, /?plot=42&takeover=1 opens a takeover. */
export function UrlActions() {
  const loaded = useCity((s) => s.loaded);
  useEffect(() => {
    if (!loaded) return;
    const sp = new URLSearchParams(window.location.search);
    const st = useCity.getState();
    const plot = Number(sp.get("plot"));
    if (plot) {
      st.select(plot);
      st.setFlyTo(plot);
    } else if (sp.get("claim")) st.setPanel("claim");
    else if (sp.get("chat")) st.setPanel("chat");
    else if (sp.get("arcade")) st.setPanel("arcade");
  }, [loaded]);
  return null;
}
