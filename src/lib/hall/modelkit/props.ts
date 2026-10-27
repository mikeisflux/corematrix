"use client";
/**
 * Procedural booth and arcade props. Every prop is a Group of named meshes with
 * named materials so colors can be swapped at runtime (cloth, banner, screen…).
 * Exported to public/models/*.glb by `npm run models`; any .glb with the same
 * name and material names can replace them.
 *
 * Origins, overall sizes, the material names and the mesh names the hall code
 * relies on (table: cloth, cloth_front, top, metal, product + mesh skirt_front;
 * banner_stand: banner; cabinet: screen) are fixed. Everything inside is free.
 * Each prop keeps one mesh per material (geometry merged at build time) so a
 * booth full of furniture stays a handful of draw calls.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const mat = (name: string, color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...extra }); m.name = name; return m; };
const group = (name: string) => { const g = new THREE.Group(); g.name = name; return g; };
/** Deterministic jitter so every export is identical. */

/** Collects geometry per material and emits one named mesh for each. */
class Parts {
  private parts = new Map<THREE.Material, { name: string; geos: THREE.BufferGeometry[] }>();
  constructor(private g: THREE.Group) {}
  add(m: THREE.Material, name: string, ...geos: THREE.BufferGeometry[]) { const p = this.parts.get(m) ?? { name, geos: [] }; p.geos.push(...geos); this.parts.set(m, p); }
  /** A single-geometry mesh that must stay its own node (the printed table front). */
  solo(m: THREE.Material, name: string, geo: THREE.BufferGeometry) { const me = new THREE.Mesh(geo, m); me.name = name; me.castShadow = true; me.receiveShadow = true; this.g.add(me); }
  done() {
    for (const [m, { name, geos }] of this.parts) {
      const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)!;
      if (geos.length > 1) geos.forEach((x) => x.dispose());
      const me = new THREE.Mesh(geo, m); me.name = name; me.castShadow = true; me.receiveShadow = true; this.g.add(me);
    }
    return this.g;
  }
}

/** A box translated so its base sits at y0 (centre x,z). */
const box = (w: number, h: number, d: number, x = 0, y0 = 0, z = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y0 + h / 2, z); return g; };
/** A vertical cylinder with its base at y0. */
const post = (r: number, h: number, x = 0, y0 = 0, z = 0, seg = 8) => { const g = new THREE.CylinderGeometry(r, r, h, seg); g.translate(x, y0 + h / 2, z); return g; };
/** A tube between two points. */
const tube = (a: [number, number, number], b: [number, number, number], r: number, seg = 6) => {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), dir = vb.clone().sub(va), len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate(va.x, va.y, va.z);
  return g;
};
/** Rounded slab in the xz plane (bevelled extrusion), base at y0, for seats and cushions. */
const pad = (w: number, d: number, t: number, radius: number, x = 0, y0 = 0, z = 0) => {
  const s = new THREE.Shape();
  const hw = w / 2 - radius, hd = d / 2 - radius;
  s.moveTo(-hw, -d / 2); s.lineTo(hw, -d / 2); s.absarc(hw, -hd, radius, -Math.PI / 2, 0, false);
  s.lineTo(w / 2, hd); s.absarc(hw, hd, radius, 0, Math.PI / 2, false);
  s.lineTo(-hw, d / 2); s.absarc(-hw, hd, radius, Math.PI / 2, Math.PI, false);
  s.lineTo(-w / 2, -hd); s.absarc(-hw, -hd, radius, Math.PI, Math.PI * 1.5, false);
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: t * 0.25, bevelSize: t * 0.25, bevelSegments: 1, curveSegments: 3 });
  g.rotateX(-Math.PI / 2); // extrude along +y
  g.translate(x, y0 + t * 0.25, z);
  return g;
};

/**
 * A pleated fabric wall from (x0,z0) to (x1,z1), y0..y1, bulging along the
 * outward normal of a counter-clockwise loop (viewed from above). Smooth
 * normals make the sine pleats read as soft folds under the hall lights.
 */
function pleats(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, amp: number, period: number, ppp = 5): THREE.BufferGeometry {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), nx = dz / len, nz = -dx / len;
  const periods = Math.max(1, Math.round(len / period)), n = periods * ppp;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, off = amp * Math.sin(t * periods * Math.PI * 2);
    const x = x0 + dx * t + nx * off, z = z0 + dz * t + nz * off;
    pos.push(x, y0, z, x, y1, z); uv.push(t * len, 0, t * len, 1);
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** Four pleated walls around a rectangle (half sizes hx, hz), one seam per corner. */
function pleatedSkirt(hx: number, hz: number, y0: number, y1: number, amp: number, period: number): THREE.BufferGeometry {
  const walls = [
    pleats(-hx, -hz, hx, -hz, y0, y1, amp, period), // the z- end
    pleats(hx, -hz, hx, hz, y0, y1, amp, period), // aisle face (+x)
    pleats(hx, hz, -hx, hz, y0, y1, amp, period), // the z+ end
    pleats(-hx, hz, -hx, -hz, y0, y1, amp, period), // back (-x), faces into the booth
  ];
  const g = mergeGeometries(walls, false)!;
  walls.forEach((w) => w.dispose());
  return g;
}
/**
 * 6 ft draped show table, origin at floor centre, long along z, aisle side +x.
 * Materials: cloth (pleated skirt + hem, recoloured per booth), cloth_front (flat
 * printed front panel over the skirt: the owner's drape art), top, metal, product
 * (+ paper/trim for the display). Stand i (of TABLE_STANDS) sits at x 0.35 with its
 * top at y 3.03, z = -len/2 + (i+0.5)·len/TABLE_STANDS: the standing comic covers in
 * Booth.tsx rely on that.
 */
export const TABLE_STANDS = 4;
/** Widest the drape print can be before its 3:1 height would overflow the skirt. */
export const DRAPE_PANEL_MAX_W = 6.3;
export function buildTable(len = 6): THREE.Group {
  const p = new Parts(group("table"));
  const cloth = mat("cloth", "#111827", { roughness: 0.92 }), top = mat("top", "#e4e7ec", { roughness: 0.7 }), metal = mat("metal", "#6b7280", { metalness: 0.6, roughness: 0.4 }), product = mat("product", "#d7dbe2", { roughness: 0.75 });
  const clothFront = mat("cloth_front", "#111827", { roughness: 0.9 });
  const paper = mat("paper", "#e6dfcc", { roughness: 0.95 }), trim = mat("trim", "#9aa3b0", { roughness: 0.6 });
  // pleated skirt all round (peaks stay inside the 2.6 ft footprint), the fitted top drop, the fold under the topper
  p.add(cloth, "skirt", pleatedSkirt(1.22, len / 2 - 0.08, 0.04, 2.28, 0.06, 0.55), box(2.76, 0.3, len + 0.16, 0, 2.22), box(2.8, 0.05, len + 0.2, 0, 2.47));
  // printed front panel: 3:1 on the outside front skirt only, as wide as the table allows but never taller than the
  // 2.2 ft skirt (so an 8 ft table gets 6.3 × 2.1, a 6 ft one 5.7 × 1.9); floats just ahead of the pleat peaks
  const fw = Math.min(len - 0.3, DRAPE_PANEL_MAX_W);
  const front = new THREE.PlaneGeometry(fw, fw / 3); front.rotateY(Math.PI / 2); front.translate(1.32, 1.15, 0);
  p.solo(clothFront, "skirt_front", front);
  p.add(top, "top", box(2.7, 0.1, len + 0.1, 0, 2.5));
  for (const [x, z] of [[-1.1, -len / 2 + 0.3], [1.1, -len / 2 + 0.3], [-1.1, len / 2 - 0.3], [1.1, len / 2 - 0.3]]) p.add(metal, "leg", post(0.05, 2.4, x, 0, z, 6));
  // display: four comic stands along the aisle edge (a riser with an easel back the cover leans on), a longbox behind each pair
  const n = TABLE_STANDS;
  for (let i = 0; i < n; i++) {
    const z = -len / 2 + (i + 0.5) * (len / n);
    p.add(product, "product", box(1.08, 0.42, 0.94, 0.35, 2.6, z));          // riser, top at 3.03
    const back = new THREE.BoxGeometry(0.03, 1.12, 0.8); back.translate(0, 0.56, 0); back.rotateZ(0.14); back.translate(0.2, 3.03, z); p.add(trim, "trim", back); // easel back, same lean as the cover
    p.add(trim, "trim", box(0.1, 0.06, 0.8, 0.42, 3.06, z));                 // lip the cover sits on
    if (i % 2 === 0) {
      // white longbox lying along the table behind the stands, lid line in trim
      p.add(product, "product", box(0.72, 0.52, 1.36, -0.72, 2.6, z + len / n / 2));
      p.add(trim, "trim", box(0.76, 0.03, 1.4, -0.72, 2.98, z + len / n / 2));
    }
  }
  // a tent card at the aisle corner
  const card = new THREE.BoxGeometry(0.02, 0.32, 0.46); card.rotateZ(-0.25); card.translate(1.05, 2.76, len / 2 - 0.4); p.add(paper, "paper", card);
  return p.done();
}

/** Folding chair: padded seat and back on a tubular steel X-frame. Materials: chair, metal. */
export function buildChair(): THREE.Group {
  const p = new Parts(group("chair"));
  const seat = mat("chair", "#2b3444", { roughness: 0.65 }), metal = mat("metal", "#9ca3af", { metalness: 0.75, roughness: 0.3 });
  // seat pad 1.5×1.5 with its top at 1.56, back pad leaning back a touch
  const back = pad(1.45, 1.0, 0.12, 0.12, 0, 0); back.rotateX(Math.PI / 2 - 0.12); back.translate(0, 2.45, -0.72);
  p.add(seat, "seat", pad(1.5, 1.5, 0.14, 0.14, 0, 1.44), back);
  // front legs run straight down from the seat front; rear legs angle back; the rear pair carries the backrest
  for (const s of [-1, 1]) {
    p.add(metal, "leg",
      tube([s * 0.68, 0.05, 0.62], [s * 0.68, 1.45, 0.62], 0.035), // front leg
      tube([s * 0.68, 0.05, -0.82], [s * 0.68, 1.45, -0.58], 0.035), // rear leg
      tube([s * 0.68, 1.45, -0.58], [s * 0.68, 3.05, -0.82], 0.035), // back upright
      tube([s * 0.68, 1.42, 0.62], [s * 0.68, 1.42, -0.6], 0.03)); // seat side rail
  }
  p.add(metal, "leg",
    tube([-0.68, 3.05, -0.82], [0.68, 3.05, -0.82], 0.03), // top bar
    tube([-0.68, 0.2, 0.62], [0.68, 0.2, 0.62], 0.03), // front foot bar
    tube([-0.68, 0.2, -0.8], [0.68, 0.2, -0.8], 0.03), // rear foot bar
    tube([-0.66, 0.4, 0.5], [0.66, 1.2, -0.5], 0.025, 5), // cross braces
    tube([0.66, 0.4, 0.5], [-0.66, 1.2, -0.5], 0.025, 5));
  return p.done();
}

/** Retractable banner stand: cassette base with feet, pole, top rail and a 2.6×6.4 panel facing +z. Materials: banner (textured at runtime), metal, banner_back, chrome. */
export function buildBannerStand(): THREE.Group {
  const p = new Parts(group("banner_stand"));
  const metal = mat("metal", "#374151", { metalness: 0.7, roughness: 0.35 }), banner = mat("banner", "#ffffff", { roughness: 0.6 });
  const dark = mat("banner_back", "#262b36", { roughness: 0.8 }), chrome = mat("chrome", "#c7ccd4", { metalness: 0.9, roughness: 0.25 });
  // cassette: a flattened cylinder lying along x, with end caps and two swing-out feet
  const cassette = new THREE.CylinderGeometry(0.17, 0.17, 2.9, 12); cassette.rotateZ(Math.PI / 2); cassette.scale(1, 0.75, 1.3); cassette.translate(0, 0.16, 0);
  p.add(metal, "base", cassette, box(0.5, 0.05, 0.9, -1.1, 0, 0), box(0.5, 0.05, 0.9, 1.1, 0, 0), box(2.8, 0.1, 0.1, 0, 6.6, -0.02));
  for (const s of [-1, 1]) { const cap = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12); cap.rotateZ(Math.PI / 2); cap.scale(1, 0.75, 1.3); cap.translate(s * 1.46, 0.16, 0); p.add(chrome, "chrome", cap, box(0.06, 0.14, 0.14, s * 1.42, 6.58, -0.02)); }
  // the slot the graphic rolls out of, the pole and the grey backing of the graphic
  p.add(dark, "panel_back", box(2.7, 0.03, 0.06, 0, 0.28, 0.02), box(2.6, 6.4, 0.015, 0, 0.22, 0));
  const pole = new THREE.CylinderGeometry(0.04, 0.045, 6.5, 8); pole.translate(0, 3.45, -0.1); p.add(chrome, "chrome", pole);
  const panel = new THREE.PlaneGeometry(2.6, 6.4); panel.translate(0, 3.42, 0.02); p.solo(banner, "panel", panel);
  return p.done();
}

/** Arcade cabinet, screen facing +z. Materials: cabinet, screen (emissive), marquee, panel, side (+ trim, chrome). */
export function buildCabinet(): THREE.Group {
  const p = new Parts(group("cabinet"));
  const body = mat("cabinet", "#1b1b2f", { roughness: 0.5, metalness: 0.1 }), screen = mat("screen", "#ffffff", { emissive: "#ff2bd6", emissiveIntensity: 1.4, roughness: 0.3 });
  const marquee = mat("marquee", "#ffd166", { emissive: "#ffd166", emissiveIntensity: 0.6 }), panel = mat("panel", "#111827", { roughness: 0.5 }), side = mat("side", "#2d2d4a");
  const trim = mat("trim", "#0b0b16", { roughness: 0.4 }), chrome = mat("chrome", "#d6dae0", { metalness: 0.9, roughness: 0.25 });
  p.add(body, "body", box(2.6, 3.2, 2.4, 0, 0, -0.1), box(2.6, 2.6, 2.0, 0, 3.3, -0.5), box(2.7, 0.9, 1.6, 0, 5.85, -0.4));
  // kick plate, bezel + screen tilted back, marquee frame, coin door, T-moulding down the front edges
  const bezel = new THREE.BoxGeometry(2.4, 2.0, 0.08); bezel.rotateX(-0.25); bezel.translate(0, 4.4, 0.5);
  p.add(trim, "trim", box(2.64, 0.4, 2.44, 0, 0, -0.1), bezel, box(2.6, 0.8, 0.06, 0, 5.9, 0.39), box(0.9, 0.7, 0.04, 0.4, 1.6, 1.11),
    box(0.05, 3.2, 0.06, -1.305, 0, 1.1), box(0.05, 3.2, 0.06, 1.305, 0, 1.1), box(0.05, 2.6, 0.06, -1.305, 3.3, 0.5), box(0.05, 2.6, 0.06, 1.305, 3.3, 0.5));
  const scr = new THREE.PlaneGeometry(2.1, 1.7); scr.rotateX(-0.25); scr.translate(0, 4.4, 0.55);
  const mq = new THREE.PlaneGeometry(2.4, 0.7); mq.translate(0, 6.3, 0.43);
  // control panel with a chrome lip, coin slot, buttons in two colours, joystick with a glowing ball
  const ctrl = new THREE.BoxGeometry(2.6, 0.3, 1.2); ctrl.rotateX(0.18); ctrl.translate(0, 3.25, 0.75);
  const ctrlEdge = new THREE.BoxGeometry(2.64, 0.06, 1.24); ctrlEdge.rotateX(0.18); ctrlEdge.translate(0, 3.42, 0.76);
  p.add(panel, "controls", ctrl);
  p.add(chrome, "chrome", ctrlEdge, box(0.12, 0.2, 0.05, 0.4, 1.85, 1.12), box(2.74, 0.06, 1.64, 0, 6.72, -0.4), post(0.05, 0.5, -0.9, 3.35, 0.9, 6));
  const btns: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [scr];
  for (const [x, z, lit] of [[-0.55, 0.9, 0], [0.0, 0.95, 1], [0.55, 0.9, 0], [0.3, 0.6, 1], [0.85, 0.65, 0]] as const) {
    const btn = new THREE.CylinderGeometry(0.11, 0.1, 0.1, 10); btn.translate(x, 3.44, z); (lit ? glow : btns).push(btn);
    const ring = new THREE.CylinderGeometry(0.14, 0.14, 0.03, 10); ring.translate(x, 3.4, z); p.add(trim, "trim", ring);
  }
  const boot = new THREE.CylinderGeometry(0.16, 0.2, 0.08, 10); boot.translate(-0.9, 3.42, 0.9); p.add(trim, "trim", boot);
  const ball = new THREE.SphereGeometry(0.13, 10, 8); ball.translate(-0.9, 3.9, 0.9); glow.push(ball);
  p.add(screen, "screen", ...glow);
  p.add(marquee, "marquee", mq, ...btns);
  for (const s of [-1, 1]) { const art = new THREE.PlaneGeometry(2.2, 5.6); art.rotateY(s * Math.PI / 2); art.translate(s * 1.305, 3.2, -0.3); p.add(side, "side", art); }
  return p.done();
}

/** Truss light fixture: housing with a louvred emissive panel, yoke and safety cables. Materials: fixture, light, trim. */
export function buildLight(): THREE.Group {
  const p = new Parts(group("light"));
  const housing = mat("fixture", "#374151", { metalness: 0.6, roughness: 0.4 }), light = mat("light", "#ffffff", { emissive: "#ffffff", emissiveIntensity: 2.2 });
  const dark = mat("trim", "#1f2430", { metalness: 0.5, roughness: 0.5 });
  p.add(housing, "housing", box(6, 0.7, 2.2, 0, 0), post(0.04, 1.2, -2.2, 0.7, 0, 6), post(0.04, 1.2, 2.2, 0.7, 0, 6));
  const l = new THREE.PlaneGeometry(5.6, 1.8); l.rotateX(Math.PI / 2); l.translate(0, -0.012, 0); p.solo(light, "panel", l);
  // frame around the lens, louvres across it, the yoke the fixture hangs from
  for (const s of [-1, 1]) p.add(dark, "trim", box(6.1, 0.08, 0.06, 0, -0.04, s * 1.13), box(0.06, 0.08, 2.3, s * 3.02, -0.04, 0), box(0.2, 0.5, 0.2, s * 2.2, 0.7));
  for (let i = 1; i < 4; i++) p.add(dark, "trim", box(5.6, 0.02, 0.03, 0, -0.03, -0.9 + i * 0.45));
  p.add(dark, "trim", box(4.8, 0.08, 0.12, 0, 0.75));
  return p.done();
}

export const PROP_BUILDERS: Record<string, () => THREE.Group> = {
  table: () => buildTable(6),
  table_wide: () => buildTable(8),
  chair: buildChair,
  banner_stand: buildBannerStand,
  cabinet: buildCabinet,
  light: buildLight,
};
