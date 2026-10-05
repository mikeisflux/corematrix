"use client";
import { useEffect } from "react";
/** Sets the first-party visitor cookie from the client (server components can't). */
export function ClientTrack({ boothId }: { boothId: number }) {
  useEffect(() => {
    if (!document.cookie.includes("fcc_vid=")) {
      void fetch("/api/track", { method: "POST", body: JSON.stringify({ kind: "hovers", boothId }), headers: { "Content-Type": "application/json" } });
    }
  }, [boothId]);
  return null;
}
