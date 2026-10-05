"use client";
/**
 * Procedural booth and arcade props. Every prop is a Group of named meshes with
 * named materials so colors can be swapped at runtime (cloth, banner, screen…).
 * Exported to public/models/*.glb by `npm run models`; any .glb with the same
 * name and material names can replace them.
 */
import * as THREE from "three";

const mat = (name: string, color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...extra }); m.name = name; return m; };
const mesh = (name: string, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(geo, m); me.name = name; me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; return me; };
const group = (name: string) => { const g = new THREE.Group(); g.name = name; return g; };

/** 6 ft draped table, origin at floor center, aisle side is +x. Materials: cloth, cloth_front (the skirt panel facing the aisle, takes the owner's drape art), top, metal, product. */
export function buildTable(len = 6): THREE.Group {
  const g = group("table");
  const cloth = mat("cloth", "#111827", { roughness: 0.9 }), top = mat("top", "#f8fafc", { roughness: 0.5 }), metal = mat("metal", "#6b7280", { metalness: 0.6, roughness: 0.4 }), product = mat("product", "#e5e7eb");
  const clothFront = mat("cloth_front", "#111827", { roughness: 0.9 });
  const skirt = new THREE.BoxGeometry(2.6, 2.45, len); skirt.translate(0, 1.225, 0);
  g.add(mesh("skirt", skirt, cloth));
  // printed front panel: 3:1, reads left-to-right from the aisle
  const front = new THREE.PlaneGeometry(len - 0.3, (len - 0.3) / 3); front.rotateY(Math.PI / 2); front.translate(1.305, 1.15, 0);
  g.add(mesh("skirt_front", front, clothFront));
  const drape = new THREE.BoxGeometry(2.75, 0.3, len + 0.15); drape.translate(0, 2.35, 0);
  g.add(mesh("drape", drape, cloth));
  const topGeo = new THREE.BoxGeometry(2.7, 0.1, len + 0.1); topGeo.translate(0, 2.55, 0);
  g.add(mesh("top", topGeo, top));
  for (const [x, z] of [[-1.1, -len / 2 + 0.3], [1.1, -len / 2 + 0.3], [-1.1, len / 2 - 0.3], [1.1, len / 2 - 0.3]]) { const leg = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6); leg.translate(x, 1.2, z); g.add(mesh("leg", leg, metal)); }
  // a few products on top
  const n = Math.max(2, Math.round(len / 2));
  for (let i = 0; i < n; i++) { const z = -len / 2 + (i + 0.5) * (len / n); const box = new THREE.BoxGeometry(1.1, 0.42, 0.95); box.translate(0.35, 2.82, z); g.add(mesh(`product_${i}`, box, product)); const stack = new THREE.BoxGeometry(0.9, 0.2, 0.75); stack.translate(-0.7, 2.7, z + 0.2); g.add(mesh(`stack_${i}`, stack, product)); }
  return g;
}

/** Folding chair. Materials: chair, metal. */
export function buildChair(): THREE.Group {
  const g = group("chair");
  const seat = mat("chair", "#1f2937", { roughness: 0.6 }), metal = mat("metal", "#9ca3af", { metalness: 0.7, roughness: 0.35 });
  const s = new THREE.BoxGeometry(1.5, 0.12, 1.5); s.translate(0, 1.5, 0); g.add(mesh("seat", s, seat));
  const b = new THREE.BoxGeometry(1.5, 1.3, 0.12); b.translate(0, 2.35, -0.7); g.add(mesh("back", b, seat));
  for (const [x, z] of [[-0.65, -0.65], [0.65, -0.65], [-0.65, 0.65], [0.65, 0.65]]) { const leg = new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6); leg.translate(x, 0.75, z); g.add(mesh("leg", leg, metal)); }
  return g;
}

/** Retractable banner stand, 2.6×6.4 panel facing +z. Materials: banner (textured at runtime), metal. */
export function buildBannerStand(): THREE.Group {
  const g = group("banner_stand");
  const metal = mat("metal", "#374151", { metalness: 0.6, roughness: 0.4 }), banner = mat("banner", "#ffffff", { roughness: 0.6 });
  const base = new THREE.BoxGeometry(2.9, 0.18, 0.9); base.translate(0, 0.09, 0); g.add(mesh("base", base, metal));
  const pole = new THREE.CylinderGeometry(0.04, 0.04, 6.6, 6); pole.translate(0, 3.4, -0.1); g.add(mesh("pole", pole, metal));
  const rail = new THREE.BoxGeometry(2.8, 0.08, 0.08); rail.translate(0, 6.65, 0); g.add(mesh("rail", rail, metal));
  const panel = new THREE.PlaneGeometry(2.6, 6.4); panel.translate(0, 3.42, 0.02); g.add(mesh("panel", panel, banner));
  return g;
}

/** Arcade cabinet, screen facing +z. Materials: cabinet, screen (emissive), marquee, panel, side. */
export function buildCabinet(): THREE.Group {
  const g = group("cabinet");
  const body = mat("cabinet", "#1b1b2f", { roughness: 0.55, metalness: 0.15 }), screen = mat("screen", "#ffffff", { emissive: "#ff2bd6", emissiveIntensity: 1.4, roughness: 0.3 });
  const marquee = mat("marquee", "#ffd166", { emissive: "#ffd166", emissiveIntensity: 0.6 }), panel = mat("panel", "#111827", { roughness: 0.5 }), side = mat("side", "#2d2d4a");
  const lower = new THREE.BoxGeometry(2.6, 3.2, 2.4); lower.translate(0, 1.6, -0.1); g.add(mesh("lower", lower, body));
  const upper = new THREE.BoxGeometry(2.6, 2.6, 2.0); upper.translate(0, 4.6, -0.5); g.add(mesh("upper", upper, body));
  const scr = new THREE.PlaneGeometry(2.1, 1.7); scr.rotateX(-0.25); scr.translate(0, 4.4, 0.52); g.add(mesh("screen", scr, screen));
  const top = new THREE.BoxGeometry(2.7, 0.9, 1.6); top.translate(0, 6.3, -0.4); g.add(mesh("marquee_box", top, body));
  const mq = new THREE.PlaneGeometry(2.4, 0.7); mq.translate(0, 6.3, 0.41); g.add(mesh("marquee", mq, marquee));
  const ctrl = new THREE.BoxGeometry(2.6, 0.3, 1.2); ctrl.rotateX(0.18); ctrl.translate(0, 3.25, 0.75); g.add(mesh("controls", ctrl, panel));
  for (const [x, z] of [[-0.55, 0.9], [0.0, 0.95], [0.55, 0.9]]) { const btn = new THREE.CylinderGeometry(0.11, 0.11, 0.1, 10); btn.translate(x, 3.42, z); g.add(mesh("button", btn, marquee)); }
  const stick = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6); stick.translate(-0.9, 3.6, 0.9); g.add(mesh("stick", stick, panel));
  const ball = new THREE.SphereGeometry(0.13, 10, 8); ball.translate(-0.9, 3.9, 0.9); g.add(mesh("ball", ball, screen));
  for (const s of [-1, 1]) { const art = new THREE.PlaneGeometry(2.2, 5.6); art.rotateY(s * Math.PI / 2); art.translate(s * 1.305, 3.2, -0.3); g.add(mesh(`side_${s < 0 ? "l" : "r"}`, art, side)); }
  return g;
}

/** Truss light fixture: housing + emissive panel pointing down. Materials: fixture, light. */
export function buildLight(): THREE.Group {
  const g = group("light");
  const housing = mat("fixture", "#374151", { metalness: 0.6, roughness: 0.4 }), light = mat("light", "#ffffff", { emissive: "#ffffff", emissiveIntensity: 2.2 });
  const h = new THREE.BoxGeometry(6, 0.7, 2.2); h.translate(0, 0.35, 0); g.add(mesh("housing", h, housing));
  const l = new THREE.PlaneGeometry(5.6, 1.8); l.rotateX(Math.PI / 2); l.translate(0, -0.01, 0); g.add(mesh("panel", l, light));
  for (const x of [-2.2, 2.2]) { const c = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6); c.translate(x, 1.3, 0); g.add(mesh("cable", c, housing)); }
  return g;
}

export const PROP_BUILDERS: Record<string, () => THREE.Group> = {
  table: () => buildTable(6),
  table_wide: () => buildTable(8),
  chair: buildChair,
  banner_stand: buildBannerStand,
  cabinet: buildCabinet,
  light: buildLight,
};
