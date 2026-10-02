import { ImageResponse } from "next/og";
import { getPlot, claimedPlots } from "@/lib/economy";
import { formatCount, formatMoney, SITE_NAME, DISTRICTS } from "@/lib/config";

export const runtime = "nodejs";

/** Share card for X / Slack / iMessage. 1200×630. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = await getPlot(Number(id));
  const all = await claimedPlots();
  const rank = p ? all.filter((x) => x.valueCents > p.valueCents).length + 1 : 0;
  const name = p?.name ?? `Plot #${id}`;
  const color = p?.color ?? "#3a86ff";
  // A tiny skyline made of the neighbours, so every card looks like the city.
  const neighbours = all.filter((x) => Math.abs(x.id - Number(id)) <= 10).slice(0, 21);
  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", background: "linear-gradient(180deg,#0b1020 0%,#141a33 100%)", color: "#eef2ff", fontFamily: "Inter, Arial", position: "relative" }}>
        <div style={{ display: "flex", position: "absolute", bottom: 0, left: 0, right: 0, height: 260, alignItems: "flex-end", gap: 10, padding: "0 60px" }}>
          {neighbours.map((n) => (
            <div key={n.id} style={{ display: "flex", width: 44, height: Math.min(240, 30 + Math.sqrt(n.valueCents / 100) * 9), background: n.id === Number(id) ? color : "#232a4a", borderRadius: "4px 4px 0 0", boxShadow: n.id === Number(id) ? `0 0 40px ${color}` : "none" }} />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 36, padding: "70px 60px 0" }}>
          <div style={{ width: 160, height: 160, borderRadius: 32, background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 72, fontWeight: 800, color: p?.accent ?? "#fff" }}>{name.slice(0, 2).toUpperCase()}</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 22, letterSpacing: 6, color: "#ffcf5c", fontWeight: 700 }}>{`PLOT #${id} · ${p ? DISTRICTS[p.district]?.name.toUpperCase() : "AVAILABLE"}`}</div>
            <div style={{ display: "flex", fontSize: 72, fontWeight: 800, lineHeight: 1.05, marginTop: 8 }}>{name}</div>
            {p?.tagline && <div style={{ display: "flex", fontSize: 30, color: "#9aa4c7", marginTop: 8 }}>{p.tagline}</div>}
          </div>
        </div>
        {p && (
          <div style={{ display: "flex", gap: 40, padding: "40px 60px 0", fontSize: 28 }}>
            <div style={{ display: "flex", flexDirection: "column" }}><span style={{ color: "#9aa4c7", fontSize: 18, letterSpacing: 3 }}>RANK</span><span style={{ fontWeight: 800 }}>{`#${rank}`}</span></div>
            <div style={{ display: "flex", flexDirection: "column" }}><span style={{ color: "#9aa4c7", fontSize: 18, letterSpacing: 3 }}>VALUE</span><span style={{ fontWeight: 800, color: "#ffcf5c" }}>{formatMoney(p.valueCents)}</span></div>
            <div style={{ display: "flex", flexDirection: "column" }}><span style={{ color: "#9aa4c7", fontSize: 18, letterSpacing: 3 }}>FLOORS</span><span style={{ fontWeight: 800 }}>{p.floors}</span></div>
            <div style={{ display: "flex", flexDirection: "column" }}><span style={{ color: "#9aa4c7", fontSize: 18, letterSpacing: 3 }}>VISITS</span><span style={{ fontWeight: 800 }}>{formatCount(p.totalViews)}</span></div>
          </div>
        )}
        <div style={{ display: "flex", position: "absolute", right: 60, top: 60, fontSize: 24, fontWeight: 800, color: "#ffcf5c", letterSpacing: 4 }}>{SITE_NAME.toUpperCase()}</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
