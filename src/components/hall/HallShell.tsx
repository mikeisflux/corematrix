"use client";
import dynamic from "next/dynamic";
import { Hud } from "./Hud";
import { UrlActions } from "./UrlActions";
import { HallErrorBoundary, ErrorReporter } from "./HallErrorBoundary";
import type { HallSnapshot } from "@/lib/hall-snapshot";

const HallCanvas = dynamic(() => import("./HallCanvas").then((m) => m.HallCanvas), { ssr: false, loading: () => null });

/** ?clean=1 hides the HUD (marketing captures, embeds). */
export function HallShell({ clean, initial }: { clean?: boolean; initial?: HallSnapshot }) {
  return (
    <HallErrorBoundary>
      <ErrorReporter />
      <HallCanvas initial={initial} />
      {!clean && <Hud />}
      <UrlActions />
    </HallErrorBoundary>
  );
}
