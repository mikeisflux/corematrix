"use client";
import dynamic from "next/dynamic";
import { Hud } from "./Hud";
import { UrlActions } from "./UrlActions";
import { HallErrorBoundary, ErrorReporter } from "./HallErrorBoundary";

const HallCanvas = dynamic(() => import("./HallCanvas").then((m) => m.HallCanvas), { ssr: false, loading: () => null });

/** ?clean=1 hides the HUD (marketing captures, embeds). */
export function HallShell({ clean }: { clean?: boolean }) {
  return (
    <HallErrorBoundary>
      <ErrorReporter />
      <HallCanvas />
      {!clean && <Hud />}
      <UrlActions />
    </HallErrorBoundary>
  );
}
