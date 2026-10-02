"use client";
import { useEffect } from "react";
/** Sets the first-party visitor cookie from the client (server components can't). */
export function ClientTrack({ plotId }: { plotId: number }) {
  useEffect(() => {
    if (!document.cookie.includes("tl_vid=")) {
      void fetch("/api/track", { method: "POST", body: JSON.stringify({ kind: "hovers", plotId }), headers: { "Content-Type": "application/json" } });
    }
  }, [plotId]);
  return null;
}
