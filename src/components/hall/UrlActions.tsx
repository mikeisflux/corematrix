"use client";
import { useEffect } from "react";
import { useHall } from "@/lib/hall/store";
import { startTour } from "@/lib/hall/tours";

/** Deep links: /?booth=42 selects, /?claim=1 opens the claim flow, /?booth=42&takeover=1 opens a takeover, /?conbot=1 calls the mascot over, /?at=x,z walks to a spot, /?tour=headliners starts a guided tour. */
export function UrlActions() {
  const loaded = useHall((s) => s.loaded);
  useEffect(() => {
    if (!loaded) return;
    const sp = new URLSearchParams(window.location.search);
    const st = useHall.getState();
    if (sp.get("night") === "1" && !st.night) st.toggleNight();
    // ?mode=walk|map wins; otherwise come back the way you left (walking stays walking)
    const wanted = sp.get("mode");
    let remembered: string | null = null;
    try { remembered = localStorage.getItem("fcc_mode"); } catch {}
    if (wanted === "walk" || wanted === "map") st.setMode(wanted);
    else if (sp.has("cam")) st.setMode("map"); // a pinned camera is a map-view deep link
    else if (remembered === "walk") st.setMode("walk");
    const booth = Number(sp.get("booth"));
    if (booth) {
      st.select(booth);
      st.setFlyTo(booth);
    } else if (sp.get("claim")) st.setPanel("claim");
    else if (sp.get("chat")) st.setPanel("chat");
    else if (sp.get("arcade")) st.setPanel("arcade");
    if (sp.get("conbot")) st.setPanel("conbot"); // works with ?booth= too: walk there, then the mascot comes over
    // ?at=x,z: a shared spot on the floor ("meet me here")
    const at = sp.get("at")?.split(",").map(Number);
    if (at && at.length === 2 && at.every((n) => Number.isFinite(n))) { st.setMode("walk"); st.setWalkPoint({ x: at[0], z: at[1] }); }
    // ?tour=<id>: a guided tour, walking (startTour switches the mode itself); an unknown id opens the list to pick from
    const tour = sp.get("tour");
    if (tour && !startTour(tour)) { st.setMode("walk"); st.setPanel("tours"); }
  }, [loaded]);
  return null;
}
