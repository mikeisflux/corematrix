"use client";
import { useEffect } from "react";
/** Sets the first-party visitor cookie from the client (server components can't). */
export function ClientTrack({ boothId }: { boothId: number }) {
  useEffect(() => {
    // the visitor cookie is httpOnly, so document.cookie can't see it: remember in localStorage that it was set once
    let seen = false; try { seen = localStorage.getItem("fcc_vid_set") === "1"; } catch { /* private mode */ }
    if (!seen) {
      try { localStorage.setItem("fcc_vid_set", "1"); } catch { /* private mode */ }
      void fetch("/api/track", { method: "POST", body: JSON.stringify({ kind: "hovers", boothId }), headers: { "Content-Type": "application/json" } });
    }
  }, [boothId]);
  return null;
}
