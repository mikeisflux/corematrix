import { ImageResponse } from "next/og";
import { getBooth, claimedBooths } from "@/lib/economy";
import { CATEGORIES, formatCount, formatMoney, SITE_NAME, BOOTH_SIZES } from "@/lib/config";
import { boothSpace, describeSpace, hallLayout, HALL_LENGTH, HALL_DEPTH, X0, Z0 } from "@/lib/hall/layout";

export const dynamic = "force-dynamic";

/** Share card: the booth's banner colors, name, stats and a mini floor plan with the booth highlighted. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = await getBooth(Number(id));
  const space = boothSpace(Number(id));
  const all = await claimedBooths();
  const claimed = new Map(all.map((b) => [b.id, b.color]));
  const rank = p ? all.filter((x) => x.valueCents > p.valueCents).length + 1 : 0;
  const color = p?.color ?? "#3a86ff";
  const name = p?.name ?? (space ? `${space.kind === "artist" ? "Table" : "Booth"} ${space.label} is open` : "ForeverComicCon");
  const scale = 1080 / HALL_LENGTH;
  const mapH = HALL_DEPTH * scale;
  const cells = hallLayout().filter((b) => b.size !== "6x10" || b.id % 3 === 0).slice(0, 900);
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: 1200, height: 630, background: "linear-gradient(135deg,#0b0f1a,#131a2e)", color: "#fff", fontFamily: "sans-serif", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 36, padding: "56px 60px 0" }}>
          <div style={{ width: 150, height: 150, borderRadius: 28, background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 66, fontWeight: 800, color: p?.accent ?? "#fff" }}>{name.slice(0, 2).toUpperCase()}</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 22, letterSpacing: 6, color: "#ffcf5c", fontWeight: 700 }}>{(space ? describeSpace(space) : "").toUpperCase()}{p ? ` · ${CATEGORIES[p.category]?.name.toUpperCase() ?? ""}` : " · OPEN"}</div>
            <div style={{ display: "flex", fontSize: 64, fontWeight: 800, lineHeight: 1.05, marginTop: 8 }}>{name.slice(0, 32)}</div>
            {p?.tagline && <div style={{ display: "flex", fontSize: 28, color: "#9aa4c7", marginTop: 8 }}>{p.tagline.slice(0, 70)}</div>}
          </div>
        </div>
        {p && (
          <div style={{ display: "flex", gap: 40, padding: "30px 60px 0", fontSize: 28 }}>
            <div style={{ display: "flex", flexDirection: "column" }}><span style={{ color: "#9aa4c7", fontSize: 18, letterSpacing: 3 }}>RANK</span><span style={{ fontWeight: 800 }}>{`#${rank}`}</span></div>
            <div style={{ display: "flex", flexDirection: "column" }}><span style={{ color: "#9aa4c7", fontSize: 18, letterSpacing: 3 }}>VALUE</span><span style={{ fontWeight: 800, color: "#ffcf5c" }}>{formatMoney(p.valueCents)}</span></div>
            <div style={{ display: "flex", flexDirection: "column" }}><span style={{ color: "#9aa4c7", fontSize: 18, letterSpacing: 3 }}>SPACE</span><span style={{ fontWeight: 800 }}>{BOOTH_SIZES[p.size as keyof typeof BOOTH_SIZES]?.short ?? p.size}</span></div>
            <div style={{ display: "flex", flexDirection: "column" }}><span style={{ color: "#9aa4c7", fontSize: 18, letterSpacing: 3 }}>VISITS</span><span style={{ fontWeight: 800 }}>{formatCount(p.totalViews)}</span></div>
          </div>
        )}
        <div style={{ display: "flex", position: "absolute", left: 60, bottom: 30, width: 1080, height: mapH, background: "#161b2b", borderRadius: 10 }}>
          {cells.map((b) => (
            <div key={b.id} style={{ display: "flex", position: "absolute", left: (b.x - b.w / 2 - X0) * scale, top: (b.z - b.d / 2 - Z0) * scale, width: Math.max(1.5, b.w * scale - 0.6), height: Math.max(1.5, b.d * scale - 0.6), background: b.id === Number(id) ? "#ffd166" : claimed.get(b.id) ?? "#2d3650", ...(b.id === Number(id) ? { boxShadow: "0 0 24px #ffd166" } : {}) }} />
          ))}
        </div>
        <div style={{ display: "flex", position: "absolute", right: 60, top: 60, fontSize: 24, fontWeight: 800, color: "#ffcf5c", letterSpacing: 4 }}>{SITE_NAME.toUpperCase()}</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
