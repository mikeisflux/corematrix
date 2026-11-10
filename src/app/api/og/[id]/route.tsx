import { ImageResponse } from "next/og";
import fs from "node:fs/promises";
import path from "node:path";
import { getPublicBooth, claimedBooths } from "@/lib/economy";
import { getArt, artFlagsFor, artBytes } from "@/lib/art";
import { r2Get, r2Readable, refKey } from "@/lib/r2";
import { CATEGORIES, formatCount, formatMoney, SITE_NAME, BOOTH_SIZES } from "@/lib/config";
import { boothSpace, describeSpace, hallLayout, HALL_LENGTH, HALL_DEPTH, X0, Z0 } from "@/lib/hall/layout";
import { siteOrigin } from "@/lib/seo";

export const dynamic = "force-dynamic";

/**
 * The floor plan, once: ~900 absolutely positioned boxes took the card renderer eight seconds; the same plan as one
 * PNG (drawn from SVG by sharp in a few ms, kept in memory) is one node. The lit booth and the claimed colours are
 * painted over it per card from a cached plan keyed by the set of claimed booths.
 */
const planCache = new Map<string, Promise<string>>();
async function floorPlanData(claimed: Map<number, string>, lit: number, w: number, h: number): Promise<string> {
  const key = `${lit}|${w}|${Array.from(claimed.entries()).map(([id, c]) => `${id}${c}`).join(",")}`;
  const hit = planCache.get(key);
  if (hit) return hit;
  const job = (async () => {
    const scale = w / HALL_LENGTH;
    const cells = hallLayout().filter((b) => b.size !== "6x10" || b.id % 3 === 0);
    const rects = cells.map((b) => `<rect x="${((b.x - b.w / 2 - X0) * scale).toFixed(1)}" y="${((b.z - b.d / 2 - Z0) * scale).toFixed(1)}" width="${Math.max(1, b.w * scale - 0.3).toFixed(1)}" height="${Math.max(1, b.d * scale - 0.3).toFixed(1)}" fill="${b.id === lit ? "#ffd166" : claimed.get(b.id) ?? "#2d3650"}"/>`).join("");
    const glow = cells.find((b) => b.id === lit);
    const halo = glow ? `<circle cx="${((glow.x - X0) * scale).toFixed(1)}" cy="${((glow.z - Z0) * scale).toFixed(1)}" r="14" fill="#ffd166" opacity="0.35"/>` : "";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="8" fill="#161b2b"/>${halo}${rects}</svg>`;
    const sharp = (await import("sharp")).default;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  })();
  planCache.set(key, job);
  if (planCache.size > 50) planCache.delete(planCache.keys().next().value!);
  job.catch(() => planCache.delete(key));
  return job;
}

/** A stored piece of booth art as a small JPEG data URL the card renderer can draw. */
async function artData(boothId: number, slot: string, width: number): Promise<string | null> {
  const row = await getArt(boothId, slot);
  if (!row) return null;
  try {
    const src = await artBytes(row); if (!src) return null;
    const sharp = (await import("sharp")).default;
    const buf = await sharp(src).resize({ width, withoutEnlargement: true }).flatten({ background: "#0b0f1a" }).jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch { return null; }
}
/** The logo, resized to a tile; initials on the booth colour when there is none the renderer can use. */
async function logoData(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null;
  try {
    let src: Buffer | null = null;
    const m = /^data:image\/(png|jpeg|webp|gif);base64,(.*)$/.exec(logoUrl);
    if (m) src = Buffer.from(m[2], "base64");
    else if (logoUrl.startsWith("r2:")) { const cfg = await r2Readable(); const obj = cfg ? await r2Get(cfg, refKey(logoUrl)).catch(() => null) : null; src = obj ? Buffer.from(obj.body) : null; }
    else if (/^\/(?!\/)[A-Za-z0-9_\-/]+\.(png|jpe?g|webp|gif)$/i.test(logoUrl) && !logoUrl.includes("..")) src = await fs.readFile(path.join(process.cwd(), "public", logoUrl));
    if (!src) return null;
    const sharp = (await import("sharp")).default;
    const buf = await sharp(src).resize(240, 240, { fit: "cover" }).png().toBuffer();
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch { return null; }
}

/**
 * Share card, 1200×630, built like a con flyer from the booth's own art: the wide banner across the top, or the
 * roll-up down the right, or an artist's first pieces in a strip; the logo, name, where it is on the floor, the
 * numbers, the address, and the floor plan with the booth lit.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const boothId = Number(id);
  const p = await getPublicBooth(boothId);
  const space = boothSpace(boothId);
  const all = await claimedBooths();
  const claimed = new Map(all.map((b) => [b.id, b.color]));
  const rank = p ? all.filter((x) => x.valueCents > p.valueCents).length + 1 : 0;
  const color = p?.color ?? "#3a86ff";
  const accent = p?.accent ?? "#fff";
  const name = p?.name ?? (space ? `${space.kind === "artist" ? "Table" : "Booth"} ${space.label} is open` : SITE_NAME);
  const origin = (await siteOrigin()).replace(/^https?:\/\//, "");
  const flags = p ? await artFlagsFor(boothId) : {};
  const pieces = Object.keys(flags).filter((k) => k.startsWith("gallery:")).sort((a, b) => Number(a.slice(8)) - Number(b.slice(8))).slice(0, 4);
  // the art decides the layout: one request each, small, so the card renders in well under a second
  const [wide, portrait, logo, strip] = await Promise.all([
    p && flags.wide ? artData(boothId, "wide", 1200) : null,
    p && !flags.wide && flags.portrait ? artData(boothId, "portrait", 320) : null,
    p ? logoData(p.logoUrl) : null,
    p && !flags.wide && !flags.portrait && pieces.length ? Promise.all(pieces.map((k) => artData(boothId, k, 300))) : [],
  ]);
  const pieceImgs: string[] = ((strip ?? []) as Array<string | null>).filter((s): s is string => !!s);
  const topArt = !!wide || pieceImgs.length > 0;
  const sideArt = !!portrait;
  const bodyTop = topArt ? 300 : 0;
  const contentW = sideArt ? 1200 - 315 : 1200;
  const mapW = 360, mapH = Math.round(HALL_DEPTH * (mapW / HALL_LENGTH));
  const plan = await floorPlanData(claimed, boothId, mapW, mapH);
  const where = space ? describeSpace(space) : "";
  const cat = p ? CATEGORIES[p.category]?.name ?? "" : "";
  const label = { display: "flex", color: "#9aa4c7", fontSize: 16, letterSpacing: 3 } as const;
  const value = { display: "flex", fontWeight: 800, fontSize: 30 } as const;
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: 1200, height: 630, background: "linear-gradient(135deg,#0b0f1a,#131a2e)", color: "#fff", fontFamily: "sans-serif", position: "relative", overflow: "hidden" }}>
        {/* top: the wide banner, or the portfolio strip */}
        {wide && <img src={wide} width={1200} height={300} style={{ position: "absolute", left: 0, top: 0, width: 1200, height: 300, objectFit: "cover" }} />}
        {!wide && pieceImgs.length > 0 && (
          <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: 1200, height: 300, gap: 0 }}>
            {pieceImgs.map((s, i) => <img key={i} src={s} width={1200 / pieceImgs.length} height={300} style={{ width: 1200 / pieceImgs.length, height: 300, objectFit: "cover" }} />)}
          </div>
        )}
        {topArt && <div style={{ display: "flex", position: "absolute", left: 0, top: 200, width: 1200, height: 100, background: "linear-gradient(180deg, rgba(11,15,26,0) 0%, #0b0f1a 100%)" }} />}
        {/* right: the roll-up banner */}
        {portrait && <img src={portrait} width={315} height={630} style={{ position: "absolute", right: 0, top: 0, width: 315, height: 630, objectFit: "cover" }} />}
        {!topArt && !sideArt && <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: 1200, height: 14, background: color }} />}
        {/* body */}
        <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: 0, top: bodyTop, width: contentW, height: 630 - bodyTop, padding: topArt ? "0 60px" : "50px 60px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            {logo
              ? <img src={logo} width={120} height={120} style={{ width: 120, height: 120, borderRadius: 24, objectFit: "cover", border: "3px solid rgba(255,255,255,0.15)" }} />
              : <div style={{ width: 120, height: 120, borderRadius: 24, background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 54, fontWeight: 800, color: accent }}>{name.slice(0, 2).toUpperCase()}</div>}
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ display: "flex", fontSize: 18, letterSpacing: 5, color: "#ffcf5c", fontWeight: 700 }}>{where.toUpperCase()}{p ? ` · ${cat.toUpperCase()}` : " · OPEN"}</div>
              <div style={{ display: "flex", fontSize: name.length > 22 ? 48 : 60, fontWeight: 800, lineHeight: 1.05, marginTop: 6 }}>{name.slice(0, 40)}</div>
              {p?.tagline && <div style={{ display: "flex", fontSize: 26, color: "#c7cde6", marginTop: 6 }}>{p.tagline.slice(0, 80)}</div>}
            </div>
          </div>
          {p && (
            <div style={{ display: "flex", gap: 44, marginTop: 28 }}>
              <div style={{ display: "flex", flexDirection: "column" }}><span style={label}>RANK</span><span style={value}>{`#${rank}`}</span></div>
              <div style={{ display: "flex", flexDirection: "column" }}><span style={label}>VALUE</span><span style={{ ...value, color: "#ffcf5c" }}>{formatMoney(p.valueCents)}</span></div>
              <div style={{ display: "flex", flexDirection: "column" }}><span style={label}>SPACE</span><span style={value}>{BOOTH_SIZES[p.size as keyof typeof BOOTH_SIZES]?.short ?? p.size}</span></div>
              <div style={{ display: "flex", flexDirection: "column" }}><span style={label}>VISITS</span><span style={value}>{formatCount(p.totalViews)}</span></div>
            </div>
          )}
          <div style={{ display: "flex", flex: 1 }} />
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", paddingBottom: 28 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 22, fontWeight: 800, color: "#ffcf5c", letterSpacing: 4 }}>{SITE_NAME.toUpperCase()}</div>
              <div style={{ display: "flex", fontSize: 18, color: "#9aa4c7", marginTop: 4 }}>the virtual comic con that never closes</div>
              <div style={{ display: "flex", fontSize: 22, color: "#fff", marginTop: 10, fontFamily: "monospace" }}>{`${origin}/app/booth/${boothId}`}</div>
            </div>
            <img src={plan} width={mapW} height={mapH} style={{ width: mapW, height: mapH, borderRadius: 8 }} />
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=3600" } },
  );
}
