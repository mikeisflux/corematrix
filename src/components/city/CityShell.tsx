"use client";
import dynamic from "next/dynamic";
import { Hud } from "./Hud";
import { UrlActions } from "./UrlActions";

const CityCanvas = dynamic(() => import("./CityCanvas").then((m) => m.CityCanvas), { ssr: false, loading: () => null });

export function CityShell() {
  return (
    <>
      <CityCanvas />
      <Hud />
      <UrlActions />
    </>
  );
}
