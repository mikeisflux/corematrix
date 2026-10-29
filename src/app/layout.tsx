import type { Metadata } from "next";
import { Geist, Geist_Mono, Syne } from "next/font/google";
import "./globals.css";
import { SITE_NAME } from "@/lib/config";
import { siteOrigin, KEYWORDS, DEFAULT_OG } from "@/lib/seo";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Syne({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700", "800"] });

/** Phones: no pinch zoom (it fights the look controls) and draw under the notch. */
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover" as const, themeColor: "#0b1020" };
export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(await siteOrigin()),
    title: { default: `${SITE_NAME}: the virtual comic con that never closes`, template: `%s · ${SITE_NAME}` },
    description: "A 3D virtual comic convention open 24/7 in your browser. Publishers, artists and shops own booths on a floor laid out like a real con. Walking it is free.",
    applicationName: SITE_NAME,
    keywords: KEYWORDS,
    category: "entertainment",
    creator: SITE_NAME,
    publisher: SITE_NAME,
    formatDetection: { telephone: false, email: false, address: false },
    icons: { icon: [{ url: "/favicon.ico" }, { url: "/icon-512.png", type: "image/png", sizes: "512x512" }], apple: [{ url: "/icon-512.png", sizes: "512x512" }] },
    openGraph: { siteName: SITE_NAME, type: "website", locale: "en_US", images: [DEFAULT_OG] },
    twitter: { card: "summary_large_image", images: [DEFAULT_OG.url] },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
