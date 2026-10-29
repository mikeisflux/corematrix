import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME}: the virtual comic con`,
    short_name: SITE_NAME,
    description: "A 3D virtual comic convention open 24/7 in your browser.",
    start_url: "/app",
    display: "fullscreen",
    background_color: "#0b1020",
    theme_color: "#0b1020",
    categories: ["entertainment", "games", "books"],
    icons: [{ src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}
