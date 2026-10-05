"use client";
import { useMemo } from "react";
import { hallLayout, HALL_LENGTH, HALL_DEPTH, X0, Z0, ARCADE, HALLS, Z_FRONT, type BoothSpace } from "@/lib/hall/layout";
import { ZONES } from "@/lib/config";

interface Props {
  claimed: Map<number, { color: string; name?: string | null }>;
  selected?: number | null;
  onPick?: (id: number) => void;
  onHover?: (id: number | null) => void;
  filterSize?: string | null;
  height?: number;
  showLabels?: boolean;
}

/** 2D floor plan of the hall, SVG. Same geometry as the 3D scene. */
export function FloorPlan({ claimed, selected, onPick, onHover, filterSize, height = 220, showLabels }: Props) {
  const spaces = useMemo(() => hallLayout(), []);
  const w = HALL_LENGTH, h = HALL_DEPTH;
  const hallW = w / HALLS.length;
  return (
    <svg viewBox={`${X0 - 4} ${Z0 - 14} ${w + 8} ${h + 20}`} width="100%" height={height} className="select-none" role="img" aria-label="Show floor map" style={{ background: "#0b0f1a", borderRadius: 12 }}>
      <rect x={X0} y={Z0} width={w} height={h} fill="#161b2b" stroke="#334155" strokeWidth={2} />
      <rect x={X0} y={Z0} width={w} height={Z_FRONT - Z0} fill="#1f2937" />
      <rect x={ARCADE.x - ARCADE.w / 2} y={ARCADE.z - ARCADE.d / 2} width={ARCADE.w} height={ARCADE.d} fill="#2a1b5e" stroke="#8338ec" strokeWidth={1.5} />
      <text x={ARCADE.x} y={ARCADE.z + 4} fontSize={14} fill="#ff2bd6" textAnchor="middle" fontWeight={800}>ARCADE</text>
      {HALLS.map((hl, i) => <text key={hl} x={X0 + hallW * (i + 0.5)} y={Z0 - 4} fontSize={13} fill="#94a3b8" textAnchor="middle" fontWeight={700}>{hl === "H" ? "ARTISTS' ALLEY" : `HALL ${hl}`}</text>)}
      {spaces.map((b: BoothSpace) => {
        const c = claimed.get(b.id);
        const dim = !!filterSize && b.size !== filterSize && !c;
        const fill = c ? c.color : b.id === selected ? "#ffd166" : dim ? "#1e2536" : b.zone === "headliner" ? "#3b3f6b" : b.zone === "front" ? "#374a6b" : b.kind === "artist" ? "#4c2d6b" : "#3f4a5c";
        return (
          <rect key={b.id} x={b.x - b.w / 2 + 0.4} y={b.z - b.d / 2 + 0.4} width={b.w - 0.8} height={b.d - 0.8} fill={fill} stroke={b.id === selected ? "#fff" : "none"} strokeWidth={1.5} opacity={c ? 0.95 : dim ? 0.5 : 0.9}
            style={{ cursor: onPick && !c ? "pointer" : onPick ? "pointer" : "default" }}
            onClick={() => onPick?.(b.id)} onMouseEnter={() => onHover?.(b.id)} onMouseLeave={() => onHover?.(null)}>
            <title>{c?.name ? `${c.name} · ${b.label}` : `${b.label} · ${b.size} · ${ZONES[b.zone].name}`}</title>
          </rect>
        );
      })}
      {showLabels && spaces.filter((b) => b.size === "20x20").map((b) => <text key={b.id} x={b.x} y={b.z + 3} fontSize={7} fill="#fff" textAnchor="middle">{b.label}</text>)}
      <text x={X0 + w / 2} y={Z0 + h + 14} fontSize={11} fill="#64748b" textAnchor="middle">▲ main entrances along this wall</text>
    </svg>
  );
}
