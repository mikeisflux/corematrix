"use client";
import dynamic from "next/dynamic";
import { Hud } from "./Hud";
import { UrlActions } from "./UrlActions";

const HallCanvas = dynamic(() => import("./HallCanvas").then((m) => m.HallCanvas), { ssr: false, loading: () => null });

export function HallShell() {
  return (
    <>
      <HallCanvas />
      <Hud />
      <UrlActions />
    </>
  );
}
