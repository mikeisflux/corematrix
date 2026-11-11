"use client";
/**
 * Procedural avatar: a stylised convention-goer built from rigid, named parts
 * so animation clips and recolouring work by name. The same builder feeds the
 * GLB exporter (npm run models) and the in-scene fallback.
 *
 * Node names (animated): root, hips, torso, head, shoulder_l/r, forearm_l/r,
 * hand_l/r, thigh_l/r, shin_l/r, shoe_l/r. Hair variants: hair_short,
 * hair_long, hair_buzz, hair_bun, hair_curly (one shown at a time). Face patch:
 * face. Badge: badge.
 * Material names: skin, hair, shirt, pants, shoes, face, badge, lanyard (the
 * runtime recolours skin/hair/shirt/pants by name), plus sole (plain white).
 *
 * Soles sit on y = 0, the top of the head is at ~6.25 ft, eyes at ~5.6 ft (the
 * first-person camera height). Every rigid part that shares a material is
 * merged into one mesh so a figure costs ~23 draw calls.
 */
import * as THREE from "three";
import { COSTUMES, COSTUME_PARTS, isCostumeId } from "@/lib/hall/costumes";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type BodyType = "a" | "b";
export const AVATAR_HEIGHT = 6.3; // top of the hair; soles on y = 0

const mat = (name: string, color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra });
  m.name = name;
  return m;
};

/* ---------- textures ---------- */

/**
 * The face, drawn once on a canvas and mapped onto a front-only sphere patch
 * (see `facePatch`), so the whole canvas is the face: canvas top = forehead,
 * canvas left = the viewer's left. Default flipY stays on; GLTFExporter
 * converts to glTF's convention on export.
 */
function faceTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 256, 256);
  const ey = 104; // eye line (a little above the centre of the head)
  // cheeks
  g.fillStyle = "rgba(255, 110, 120, 0.28)";
  for (const dx of [-62, 62]) { g.beginPath(); g.ellipse(128 + dx, ey + 44, 22, 13, 0, 0, Math.PI * 2); g.fill(); }
  // brows
  g.strokeStyle = "#2a1a12"; g.lineWidth = 7; g.lineCap = "round";
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(128 + s * 52, ey - 36); g.quadraticCurveTo(128 + s * 36, ey - 46, 128 + s * 18, ey - 38); g.stroke(); }
  // eyes: white, iris, pupil, highlights
  for (const s of [-1, 1]) {
    const x = 128 + s * 36;
    g.fillStyle = "#ffffff"; g.beginPath(); g.ellipse(x, ey, 19, 23, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#3b6ea5"; g.beginPath(); g.ellipse(x + s * 2, ey + 3, 12, 14, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#14101a"; g.beginPath(); g.ellipse(x + s * 2, ey + 4, 7.5, 9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#ffffff"; g.beginPath(); g.arc(x - 4 + s * 2, ey - 4, 4, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x + 5 + s * 2, ey + 8, 2, 0, Math.PI * 2); g.fill();
    // upper lid line
    g.strokeStyle = "#2a1a12"; g.lineWidth = 3.5; g.beginPath(); g.ellipse(x, ey, 19.5, 23.5, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
  }
  // nose hint
  g.strokeStyle = "rgba(90, 50, 30, 0.45)"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(124, ey + 34); g.quadraticCurveTo(128, ey + 40, 134, ey + 35); g.stroke();
  // smile
  g.strokeStyle = "#7a2f35"; g.lineWidth = 5;
  g.beginPath(); g.moveTo(104, ey + 58); g.quadraticCurveTo(128, ey + 82, 152, ey + 58); g.stroke();
  g.fillStyle = "#ffffff"; g.beginPath(); g.moveTo(108, ey + 60); g.quadraticCurveTo(128, ey + 74, 148, ey + 60); g.quadraticCurveTo(128, ey + 68, 108, ey + 60); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A convention badge: colour band, photo, name lines and a barcode. */
function badgeTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 96; c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f8fafc"; g.fillRect(0, 0, 96, 128);
  g.fillStyle = "#e63946"; g.fillRect(0, 0, 96, 24);
  g.fillStyle = "#ffd166"; g.font = "bold 14px sans-serif"; g.textAlign = "center"; g.fillText("ATTENDEE", 48, 18);
  g.fillStyle = "#ffdfc4"; g.fillRect(10, 36, 30, 36);
  g.fillStyle = "#2b1b12"; g.beginPath(); g.arc(25, 48, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#1f2a44"; g.fillRect(48, 40, 40, 6); g.fillStyle = "#94a3b8"; g.fillRect(48, 52, 32, 5); g.fillRect(48, 62, 36, 5);
  g.fillStyle = "#111827";
  for (let x = 10, i = 0; x < 86; i++) { const w = (i % 3) + 1; g.fillRect(x, 92, w, 26); x += w + 2 + (i % 2); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- geometry helpers ---------- */

const merge = (...geos: THREE.BufferGeometry[]): THREE.BufferGeometry => {
  const g = mergeGeometries(geos, false);
  if (!g) throw new Error("avatar: geometry merge failed");
  for (const x of geos) x.dispose();
  return g;
};
const sphere = (r: number, w = 10, h = 7) => new THREE.SphereGeometry(r, w, h);

/** A rounded limb hanging from the origin: tapered cylinder plus sphere caps. */
function limb(rTop: number, rBot: number, len: number, opts: { capTop?: number | false; capBot?: number | false; radial?: number } = {}): THREE.BufferGeometry {
  const radial = opts.radial ?? 12;
  const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(rTop, rBot, len, radial, 1, true).translate(0, -len / 2, 0)];
  if (opts.capTop !== false) parts.push(sphere(opts.capTop ?? rTop, radial, 7));
  // the lower cap only needs its bottom half; the top half is inside the cylinder
  if (opts.capBot !== false) parts.push(new THREE.SphereGeometry(opts.capBot ?? rBot, radial, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(0, -len, 0));
  return merge(...parts);
}

/** A thin bar from `a` to `b` (lanyard straps). */
function bar(a: [number, number, number], b: [number, number, number], w: number): THREE.BufferGeometry {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
  const dir = to.clone().sub(from); const len = dir.length();
  const g = new THREE.BoxGeometry(w, len, w);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  return g;
}

/* ---------- the figure ---------- */

const HEAD_R = 0.7;
const HEAD_SCALE: [number, number, number] = [1, 1.08, 0.96];
/** Where the costume parts drawn round the eyes have them: this far either side of the middle, this far above the head's centre. */
export const OLD_EYE = { x: 0.26, y: 0.12 };
/** The pointed hat: its band's height above the head's centre and its radius there. */
export const AVATAR_HAT = { y: 0.36, r: 0.74 };
/** The dark glasses: the front's depth, and each arm's side offset, height above the eyes and length back to the ear. */
export const AVATAR_SHADES = { z: (HEAD_R + 0.02) * 0.96 + 0.05, x: 0.47, y: 0.08, len: 0.6 };
/** The earpiece's bud, in the head's space (the ear on the +x side). */
export const AVATAR_EARBUD: [number, number, number] = [0.74, 0.62 - 0.02, -0.02];

export function buildAvatar(body: BodyType): THREE.Group {
  const wide = body === "a";
  // body a: broad shoulders, straight hips. body b: narrower shoulders, fuller hips, slimmer limbs.
  const shoulderF = wide ? 1.12 : 0.9, hipF = wide ? 0.96 : 1.06, waistF = wide ? 1 : 0.92, limbF = wide ? 1 : 0.92;

  const skin = mat("skin", "#ffdfc4"), hair = mat("hair", "#2b1b12", { roughness: 0.55, side: THREE.DoubleSide });
  const shirt = mat("shirt", "#e63946", { roughness: 0.85 }), pants = mat("pants", "#1f2a44", { roughness: 0.9 });
  const shoes = mat("shoes", "#1b1b1f", { roughness: 0.5 }), badge = mat("badge", "#ffffff", { roughness: 0.35, map: badgeTexture() });
  const lanyard = mat("lanyard", "#111827", { roughness: 0.8 }), sole = mat("sole", "#e5e7eb", { roughness: 0.6 });
  const face = mat("face", "#ffffff", { map: faceTexture(), transparent: true, roughness: 0.6 });
  // cosplay materials: recoloured per preset at runtime
  const costume = mat("costume", "#b91c1c", { roughness: 0.45, metalness: 0.15 }), costume2 = mat("costume2", "#facc15", { roughness: 0.4, metalness: 0.2, emissive: "#000000" });
  const cape = mat("cape", "#b91c1c", { roughness: 0.9, side: THREE.DoubleSide });
  const lens = mat("lens", "#f8fafc", { roughness: 0.3, metalness: 0, emissive: "#ffffff", emissiveIntensity: 0.35 }); // the white eyes of a cowl
  // carried props: the metal/wood of hilts, wands and packs (recoloured per preset) and the glowing parts (emissive)
  const prop = mat("prop", "#4b5563", { roughness: 0.5, metalness: 0.55 }), glow = mat("glow", "#60a5fa", { roughness: 0.3, emissive: "#60a5fa", emissiveIntensity: 1.5 });

  const node = (name: string, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); return g; };
  const mesh = (name: string, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(geo, m); me.name = name; me.position.set(x, y, z); me.castShadow = true; return me; };

  const root = node("root");
  const hips = node("hips", 0, 3.0, 0);
  root.add(hips);

  /* pelvis */
  hips.add(mesh("pelvis_m", sphere(0.78, 14, 8).scale(hipF, 0.56, 0.78), pants, 0, -0.02, 0));

  /* legs: hip joint 2.9 → knee 1.6 → ankle 0.35 → sole 0 */
  for (const side of ["l", "r"] as const) {
    const sx = (side === "l" ? -1 : 1) * 0.4 * hipF;
    const thigh = node(`thigh_${side}`, sx, -0.1, 0);
    thigh.add(mesh(`thigh_${side}_m`, limb(0.33 * limbF, 0.29 * limbF, 1.3, { capTop: 0.35 * limbF, capBot: 0.29 * limbF }), pants));
    const shin = node(`shin_${side}`, 0, -1.3, 0);
    shin.add(mesh(`shin_${side}_m`, limb(0.27 * limbF, 0.2 * limbF, 1.25, { capTop: false, capBot: 0.2 * limbF }), pants));
    const shoe = node(`shoe_${side}`, 0, -1.25, 0.06);
    const upper = new THREE.CapsuleGeometry(0.27, 0.5, 4, 10).rotateX(Math.PI / 2).scale(1.15, 0.78, 1.0).translate(0, -0.14, 0.16);
    const tongue = sphere(0.2, 8, 5).scale(1.1, 0.7, 1).translate(0, 0.0, 0.05);
    shoe.add(mesh(`shoe_${side}_m`, merge(upper, tongue), shoes));
    const soleGeo = new THREE.CapsuleGeometry(0.29, 0.55, 2, 8).rotateX(Math.PI / 2).scale(1.15, 0.2, 1.0).translate(0, -0.3, 0.17);
    shoe.add(mesh(`sole_${side}_m`, soleGeo, sole));
    shin.add(shoe); thigh.add(shin); hips.add(thigh);
  }

  /* torso: a hoodie turned on a lathe, hem at the hips, rounded shoulders */
  const torso = node("torso", 0, 0.15, 0);
  // profile [radius, y] from hem to neckline; width eases from hip to shoulder factor
  const prof: [number, number][] = [[0.82, -0.4], [0.9, -0.2], [0.86, 0.35], [0.92, 0.85], [1.0, 1.2], [1.0, 1.42], [0.9, 1.58], [0.62, 1.7], [0.3, 1.76]];
  const R = (y: number): number => {
    const k = THREE.MathUtils.clamp((y + 0.4) / 2.16, 0, 1);
    const f = THREE.MathUtils.lerp(hipF, shoulderF, k) * (y > 0 && y < 1.0 ? waistF : 1);
    for (let i = 1; i < prof.length; i++) if (y <= prof[i][1]) { const [r0, y0] = prof[i - 1], [r1, y1] = prof[i]; return THREE.MathUtils.lerp(r0, r1, (y - y0) / (y1 - y0)) * f; }
    return prof[prof.length - 1][0] * f;
  };
  const pts = [new THREE.Vector2(0, -0.4), ...prof.map(([, y]) => new THREE.Vector2(R(y), y)), new THREE.Vector2(0, 1.78)];
  const hoodie = new THREE.LatheGeometry(pts, 22).scale(1, 1, 0.74);
  const hood = sphere(0.6, 12, 8).scale(1.3 * shoulderF, 0.5, 0.9).translate(0, 1.55, -0.42);
  const zF = (y: number) => R(y) * 0.74; // front surface depth at height y
  // kangaroo pocket: a slice of a slightly larger cylinder so it hugs the chest
  const pocket = new THREE.CylinderGeometry(R(0.4) + 0.035, R(0.0) + 0.035, 0.42, 10, 1, false, -0.62, 1.24).scale(1, 1, 0.74).translate(0, 0.2, 0);
  torso.add(mesh("torso_m", merge(hoodie, hood, pocket), shirt));
  torso.add(mesh("neck_m", new THREE.CylinderGeometry(0.21, 0.25, 0.5, 12), skin, 0, 1.62, 0));
  // lanyard: a loop resting on the collar round the neck, two straps over the collar and down the chest to the badge clip
  const ring = new THREE.TorusGeometry(0.31, 0.03, 5, 16).rotateX(Math.PI / 2).translate(0, 1.81, 0);
  const badgeTop = 1.28, badgeH = 0.82, badgeY = badgeTop - badgeH / 2, clipY = badgeTop + 0.04;
  const straps = [-1, 1].flatMap((s) => [bar([s * 0.29, 1.8, 0.16], [s * 0.18, 1.6, zF(1.6) + 0.06], 0.06), bar([s * 0.18, 1.6, zF(1.6) + 0.06], [s * 0.06, clipY, zF(clipY) + 0.04], 0.06)]);
  const clip = new THREE.BoxGeometry(0.22, 0.09, 0.08).translate(0, clipY, zF(clipY) + 0.04);
  torso.add(mesh("lanyard_m", merge(ring, ...straps, clip), lanyard));
  torso.add(mesh("badge", new THREE.BoxGeometry(0.64, badgeH, 0.05), badge, 0, badgeY, zF(badgeY) + 0.05));
  hips.add(torso);

  /* head: skin sphere with ears and nose merged, face patch on top */
  const head = node("head", 0, 1.72, 0);
  const hc = 0.62; // head centre above the head node (abs 5.49)
  const skull = sphere(HEAD_R, 20, 14).scale(...HEAD_SCALE);
  const ears = [-1, 1].map((s) => sphere(0.15, 8, 6).scale(0.55, 1, 0.8).translate(s * 0.69, -0.03, -0.02));
  const nose = sphere(0.075, 8, 6).translate(0, -0.08, HEAD_R * 0.96 - 0.01);
  head.add(mesh("head_m", merge(skull, ...ears, nose).translate(0, hc, 0), skin));
  // front-only patch: phi ±0.8 rad about +z, theta from 46° to 129° off the top
  const patch = new THREE.SphereGeometry(HEAD_R + 0.012, 14, 10, Math.PI / 2 - 0.8, 1.6, 0.8, 1.45).scale(...HEAD_SCALE);
  head.add(mesh("face", patch, face, 0, hc, 0));

  /* hair variants: one mesh each, toggled by name at runtime */
  // a cap tilted back so the front edge sits on the forehead while the back reaches the nape
  const cap = (r: number, len: number, tilt: number, dz = -0.02, w = 20) => new THREE.SphereGeometry(r, w, 10, 0, Math.PI * 2, 0, len).rotateX(-tilt).scale(...HEAD_SCALE).translate(0, hc, dz);
  const fringe = (x: number, w: number) => sphere(0.34, 10, 7).scale(w, 0.36, 0.9).translate(x, hc + 0.49, 0.4);
  head.add(mesh("hair_short", merge(cap(0.76, 1.5, 0.5), fringe(0.06, 1.9)), hair));
  head.add(mesh("hair_buzz", cap(0.72, 1.45, 0.5), hair));
  // long: the cap plus a rounded mass wrapping the back and sides down to the shoulders (phi covers the back and sides)
  const back = new THREE.SphereGeometry(0.77, 20, 12, Math.PI - 0.5, Math.PI + 1.0, 0.3, Math.PI * 0.56).scale(0.99, 1.48, 0.9).translate(0, hc - 0.2, -0.06);
  head.add(mesh("hair_long", merge(cap(0.77, 1.75, 0.82), back, fringe(-0.1, 1.6)), hair));
  const bun = sphere(0.31, 12, 9).translate(0, hc + 0.5, -0.6), knot = sphere(0.2, 8, 6).scale(1.3, 0.7, 1).translate(0, hc + 0.58, -0.4);
  head.add(mesh("hair_bun", merge(cap(0.74, 1.5, 0.48), bun, knot), hair));
  const curls: THREE.BufferGeometry[] = [cap(0.82, 1.6, 0.55, -0.04, 16)];
  // a ring of curls round the cap edge; the ones at the front ride up to the hairline so they never cover the eyes
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + 0.3, f = Math.max(0, Math.cos(a)); curls.push(sphere(0.27, 7, 5).translate(Math.sin(a) * (0.74 - f * 0.12), hc + 0.2 + f * 0.42, Math.cos(a) * 0.66 - 0.08)); }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.8; curls.push(sphere(0.3, 7, 5).translate(Math.sin(a) * 0.42, hc + 0.72, Math.cos(a) * 0.38 - 0.06)); }
  head.add(mesh("hair_curly", merge(...curls), hair));
  torso.add(head);

  /* arms: shoulder 4.55 → elbow 3.5 → wrist 2.55 */
  for (const side of ["l", "r"] as const) {
    const sx = side === "l" ? -1 : 1;
    const sh = node(`shoulder_${side}`, sx * (R(1.35) + 0.04), 1.38, 0);
    sh.add(mesh(`upperarm_${side}_m`, limb(0.27 * limbF, 0.24 * limbF, 1.05, { capTop: 0.31 * limbF, capBot: 0.24 * limbF }), shirt));
    const fa = node(`forearm_${side}`, 0, -1.05, 0);
    fa.add(mesh(`forearm_${side}_m`, limb(0.21 * limbF, 0.18 * limbF, 0.95, { capTop: false, capBot: 0.18 * limbF }), skin));
    const hand = node(`hand_${side}`, 0, -0.95, 0);
    const palm = sphere(0.25 * limbF, 9, 7).scale(0.85, 1.15, 0.6).translate(0, -0.2, 0.02);
    const thumb = sphere(0.1 * limbF, 6, 4).translate(-sx * 0.17 * limbF, -0.1, 0.14);
    hand.add(mesh(`hand_${side}_m`, merge(palm, thumb), skin));
    fa.add(hand); sh.add(fa); torso.add(sh);
  }

  /* cosplay parts: all built in, shown per preset at runtime (see applyAvatarLook) */
  // cape: a curved sheet hanging from the shoulders to the calves, flaring out a little
  const capePts = [new THREE.Vector2(0.95 * shoulderF, 1.5), new THREE.Vector2(1.0 * shoulderF, 0.6), new THREE.Vector2(1.08, -0.4), new THREE.Vector2(1.18, -1.4), new THREE.Vector2(1.28, -2.3)];
  const capeGeo = new THREE.LatheGeometry(capePts, 14, Math.PI * 0.62, Math.PI * 0.76).scale(1, 1, 0.74).translate(0, 0, -0.12);
  torso.add(mesh("cos_cape", capeGeo, cape));
  // domino mask: an opening for each eye, ringed out to a pointed outline, the two halves meeting over the nose. It
  // is drawn round the eyes (OLD_EYE) so the fit can lay each opening on a real eye. Outline: the right half in eye
  // spacings, anticlockwise from the lower end of the bridge.
  const onHead = (x: number, y: number, r: number) => r * HEAD_SCALE[2] * Math.sqrt(Math.max(0.05, 1 - (x / (r * HEAD_SCALE[0])) ** 2 - ((y - hc) / (r * HEAD_SCALE[1])) ** 2)); // the front of a ball of radius r round the head, at (x, y)
  const maskHalf: [number, number][] = [[0, -0.32], [0.3, -0.46], [0.7, -0.68], [1.15, -0.72], [1.48, -0.55], [1.7, -0.2], [1.84, 0.3], [1.52, 0.6], [1.1, 0.72], [0.5, 0.68], [0, 0.54]];
  const maskRim: [number, number][] = []; // the outline with no step longer than a third of an eye spacing
  maskHalf.forEach(([x, y], i) => { const [nx, ny] = maskHalf[(i + 1) % maskHalf.length]; const n = Math.ceil(Math.hypot(nx - x, ny - y) / 0.34); for (let k = 0; k < n; k++) maskRim.push([x + ((nx - x) * k) / n, y + ((ny - y) * k) / n]); });
  const maskPos: number[] = [], maskIdx: number[] = [];
  for (const side of [1, -1]) {
    const base = maskPos.length / 3;
    for (const [x, y] of maskRim) {
      const a = Math.atan2(y, x - 1), hole: [number, number] = [1 + 0.54 * Math.cos(a), 0.34 * Math.sin(a)]; // the eye opening's edge on the way to this point
      for (const t of [0, 0.5, 1]) { const px = side * OLD_EYE.x * (hole[0] + (x - hole[0]) * t), py = hc + OLD_EYE.y + OLD_EYE.x * (hole[1] + (y - hole[1]) * t); maskPos.push(px, py, onHead(px, py, HEAD_R + 0.03)); }
    }
    for (let i = 0; i < maskRim.length; i++) for (const r of [0, 1]) {
      const a = base + i * 3 + r, b = a + 1, c = base + ((i + 1) % maskRim.length) * 3 + r + 1, d = c - 1;
      if (side > 0) maskIdx.push(a, b, c, a, c, d); else maskIdx.push(a, c, b, a, d, c);
    }
  }
  const maskGeo = new THREE.BufferGeometry(); maskGeo.setAttribute("position", new THREE.Float32BufferAttribute(maskPos, 3)); maskGeo.setIndex(maskIdx); maskGeo.computeVertexNormals();
  head.add(mesh("cos_mask", maskGeo, costume2));
  // cowl: crown, sides and back of the head and a band from the forehead to the middle of the nose, two ears on top;
  // the mouth, chin and jaw stay open, and white lenses sit over the eyes (the sphere's front is phi = π/2). The
  // pieces share their edge vertices (24 steps round, the face a third of the way), so the fit can weld them.
  const cowlR = HEAD_R + 0.03, third = Math.PI / 3;
  const cowlCrown = new THREE.SphereGeometry(cowlR, 24, 6, 0, Math.PI * 2, 0, 0.9).scale(...HEAD_SCALE).translate(0, hc, 0);
  const cowlBack = new THREE.SphereGeometry(cowlR, 16, 8, Math.PI / 2 + third, Math.PI * 2 - 2 * third, 0.9, 1.25).scale(...HEAD_SCALE).translate(0, hc, 0);
  const cowlBand = new THREE.SphereGeometry(cowlR, 8, 4, Math.PI / 2 - third, 2 * third, 0.9, 0.72).scale(...HEAD_SCALE).translate(0, hc, 0);
  const ears2 = [-1, 1].map((s) => new THREE.ConeGeometry(0.15, 0.46, 6).rotateZ(-s * 0.12).translate(s * 0.42, hc + 0.8, -0.08));
  head.add(mesh("cos_cowl", merge(cowlCrown, cowlBack, cowlBand, ...ears2), costume));
  // the lenses: flat slanted almonds, the inner corner low, each a fan round its middle so it can lie on the cowl
  const lensRim: [number, number][] = [[-0.15, -0.035], [-0.02, -0.065], [0.12, -0.03], [0.17, 0.06], [0.05, 0.07], [-0.1, 0.02]];
  const lensPos: number[] = [], lensIdx: number[] = [];
  for (const side of [1, -1]) {
    const base = lensPos.length / 3; const at = (x: number, y: number) => { const px = side * (OLD_EYE.x + x), py = hc + OLD_EYE.y + y; lensPos.push(px, py, onHead(px, py, cowlR + 0.02)); };
    at(0.01, 0.005); for (const [x, y] of lensRim) at(x, y);
    for (let i = 0; i < lensRim.length; i++) { const a = base + 1 + i, b = base + 1 + ((i + 1) % lensRim.length); if (side > 0) lensIdx.push(base, a, b); else lensIdx.push(base, b, a); }
  }
  const lensGeo = new THREE.BufferGeometry(); lensGeo.setAttribute("position", new THREE.Float32BufferAttribute(lensPos, 3)); lensGeo.setIndex(lensIdx); lensGeo.computeVertexNormals();
  head.add(mesh("cos_cowl_eyes", lensGeo, lens));
  // full-face helmet: a shell all round, open underneath, with a window from the forehead to the middle of the nose
  // that the visor fills (same edge vertices as the cowl's pieces)
  const helmR = HEAD_R + 0.07;
  const crown = new THREE.SphereGeometry(helmR, 24, 6, 0, Math.PI * 2, 0, 0.9).scale(...HEAD_SCALE).translate(0, hc, 0);
  const shell = new THREE.SphereGeometry(helmR, 16, 4, Math.PI / 2 + third, Math.PI * 2 - 2 * third, 0.9, 0.72).scale(...HEAD_SCALE).translate(0, hc, 0);
  const chin = new THREE.SphereGeometry(helmR, 24, 5, 0, Math.PI * 2, 1.62, 0.93).scale(...HEAD_SCALE).translate(0, hc, 0);
  head.add(mesh("cos_helmet", merge(shell, crown, chin), costume));
  head.add(mesh("cos_helmet_visor", new THREE.SphereGeometry(helmR + 0.004, 8, 4, Math.PI / 2 - third, 2 * third, 0.9, 0.72).scale(...HEAD_SCALE), costume2, 0, hc, 0));
  // pointed hat: a wide brim that droops a little (with an underside, the material is one-sided), a crown that clears
  // the top of the head before it tapers, and a tip that leans back
  const HAT = AVATAR_HAT, hatY = hc + HAT.y;
  const hatPts: [number, number][] = [[1.28, -0.07], [1.0, -0.015], [HAT.r, 0], [HAT.r - 0.01, 0.16], [0.6, 0.48], [0.4, 0.95], [0.2, 1.42], [0.07, 1.72], [0, 1.82]];
  const cone = new THREE.LatheGeometry(hatPts.map(([r, y]) => new THREE.Vector2(r, hatY + y)), 16);
  const lean = cone.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < lean.count; i++) { const up = Math.max(0, lean.getY(i) - hatY - 0.5) / 1.32; lean.setZ(i, lean.getZ(i) - 0.38 * up * up); }
  const brim = new THREE.LatheGeometry([[HAT.r, -0.02], [1.0, -0.035], [1.28, -0.09]].map(([r, y]) => new THREE.Vector2(r, hatY + y)), 16);
  head.add(mesh("cos_hat", merge(cone, brim), costume));
  // antenna headband: a band over the top of the head from ear to ear, with two short stalks and a ball on each
  const band = new THREE.TorusGeometry(HEAD_R + 0.03, 0.035, 5, 16, Math.PI * 0.72).rotateZ(Math.PI * 0.14).scale(...HEAD_SCALE).translate(0, hc, 0);
  const stalks = [-1, 1].flatMap((s) => { const a = s * 0.4, at = (r: number): [number, number, number] => [Math.sin(a) * r, hc + Math.cos(a) * r * HEAD_SCALE[1], 0]; return [new THREE.CylinderGeometry(0.02, 0.024, 0.5, 6, 1, true).rotateZ(-a).translate(...at(HEAD_R + 0.27)), sphere(0.08, 8, 6).translate(...at(HEAD_R + 0.56))]; });
  head.add(mesh("cos_antenna", merge(band, ...stalks), costume2));
  // chest plate hugging the torso front: a breastplate with a shallow scooped neckline, cut-away armholes and a lower
  // edge that dips at the middle; a raised rim runs along the neckline
  const plateTop = (a: number) => { const d = Math.abs(a); return 1.39 + 0.1 * Math.min(1, d / 0.55) ** 2 - 0.46 * THREE.MathUtils.smoothstep(d, 0.68, 0.95); };
  const plateAt = (a: number, v: number, out: number) => { const y = THREE.MathUtils.lerp(0.12 + 0.2 * (a / 0.95) ** 2, plateTop(a), v), r = R(y) + out; return new THREE.Vector3(r * Math.sin(a), y, r * Math.cos(a) * 0.76); };
  const plateCols = 12, plateRows = 4, platePos: number[] = [], plateIdx: number[] = [];
  for (let j = 0; j <= plateRows; j++) for (let i = 0; i <= plateCols; i++) platePos.push(...plateAt((i / plateCols - 0.5) * 1.9, j / plateRows, 0.05).toArray());
  for (let j = 0; j < plateRows; j++) for (let i = 0; i < plateCols; i++) { const k = j * (plateCols + 1) + i; plateIdx.push(k, k + 1, k + plateCols + 2, k, k + plateCols + 2, k + plateCols + 1); }
  const plate = new THREE.BufferGeometry(); plate.setAttribute("position", new THREE.Float32BufferAttribute(platePos, 3)); plate.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((platePos.length / 3) * 2), 2)); plate.setIndex(plateIdx); plate.computeVertexNormals();
  const rimPath = new THREE.CatmullRomCurve3(Array.from({ length: 11 }, (_, i) => plateAt((i / 10 - 0.5) * 1.36, 1, 0.07)));
  const collar = new THREE.TubeGeometry(rimPath, 12, 0.04, 5);
  torso.add(mesh("cos_chest", merge(plate, collar), costume));
  // shoulder pads
  const pads = [-1, 1].map((s) => sphere(0.4, 12, 8).scale(1, 0.7, 1).translate(s * (R(1.35) + 0.04), 1.48, 0));
  torso.add(mesh("cos_pads", merge(...pads), costume));
  // belt with a buckle
  // a flat strap with bevelled edges (not a tube), and a plate of a buckle a little taller than it
  const beltR = R(-0.2), beltRing = new THREE.LatheGeometry([new THREE.Vector2(beltR, -0.3), new THREE.Vector2(beltR + 0.05, -0.28), new THREE.Vector2(beltR + 0.05, -0.12), new THREE.Vector2(beltR, -0.1)], 22).scale(1, 1, 0.74);
  const buckle = new THREE.BoxGeometry(0.36, 0.3, 0.06).translate(0, -0.2, zF(-0.2) + 0.07);
  torso.add(mesh("cos_belt", merge(beltRing, buckle), costume2));
  // chest emblems (flat decals above the pocket)
  const emblemY = 1.1, emblemZ = zF(emblemY) + 0.07;
  const starShape = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.15 : 0.34, a = Math.PI / 2 + (i / 10) * Math.PI * 2; if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  torso.add(mesh("cos_emblem_star", new THREE.ShapeGeometry(starShape).translate(0, emblemY, emblemZ), costume2));
  const bolt = new THREE.Shape(); bolt.moveTo(0.06, 0.36); bolt.lineTo(-0.2, 0.02); bolt.lineTo(-0.02, 0.02); bolt.lineTo(-0.12, -0.36); bolt.lineTo(0.2, 0.06); bolt.lineTo(0.02, 0.06); bolt.lineTo(0.06, 0.36);
  torso.add(mesh("cos_emblem_bolt", new THREE.ShapeGeometry(bolt).translate(0, emblemY, emblemZ), costume2));
  torso.add(mesh("cos_emblem_ring", new THREE.RingGeometry(0.16, 0.3, 24).translate(0, emblemY, emblemZ), costume2));
  // hood: a loose cowl a size up from the head, open in front from the forehead down; its rim stands off the face
  // and juts out over the brow. Below it a mantle lies on the shoulders, open at the chest like a cloak, so nothing
  // reads as a collar at the neck. Everything below the head's underside is the mantle (the fit lays it on the body).
  // The material is one-sided, so the hood has a lining: the same surface a little smaller, facing inward.
  const hoodR = HEAD_R + 0.1, hoodTop = 1.02, hoodGap = Math.PI / 6;
  const hoodPiece = (r: number) => [new THREE.SphereGeometry(r, 24, 5, 0, Math.PI * 2, 0, hoodTop), new THREE.SphereGeometry(r, 20, 6, Math.PI / 2 + hoodGap, Math.PI * 2 - 2 * hoodGap, hoodTop, 2.6 - hoodTop)];
  const hoodOuter = hoodPiece(hoodR), hoodLining = hoodPiece(hoodR - 0.025);
  for (const g of hoodLining) { const ix = g.index!; for (let i = 0; i < ix.count; i += 3) { const t = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, t); } }
  for (const g of [...hoodOuter, ...hoodLining]) {
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), theta = Math.acos(THREE.MathUtils.clamp(y / Math.hypot(x, y, z), -1, 1)), phi = Math.abs(Math.atan2(x, z)); // phi: 0 at the front
      const edge = theta <= hoodTop ? Math.hypot(hoodTop - theta, Math.max(0, phi - hoodGap) * Math.sin(hoodTop)) : (phi - hoodGap) * Math.sin(theta); // how far round the ball from the opening
      const rim = Math.exp(-((edge / 0.3) ** 2)), peak = Math.max(0, Math.cos(phi)) * (1 - THREE.MathUtils.smoothstep(theta, hoodTop, hoodTop + 0.5));
      const k = 1 + rim * (0.09 + 0.15 * peak); p.setXYZ(i, x * k, y * k, z * k);
    }
    g.scale(...HEAD_SCALE).translate(0, hc, 0);
  }
  const mantlePts = ([[1.5, -1.5], [1.44, -1.34], [1.28, -1.18], [1.04, -1.05], [0.78, -0.95], [0.56, -0.86], [0.46, -0.79]] as [number, number][]).map(([r, y]) => new THREE.Vector2(r, hc + y));
  const mantle = new THREE.LatheGeometry(mantlePts, 20, 0.6, Math.PI * 2 - 1.2).scale(1, 1, 0.8);
  head.add(mesh("cos_hood", merge(...hoodOuter, ...hoodLining, mantle), costume));
  // robe: a full skirt from the waist to the shins, so the legs read as cloth
  const robePts = [new THREE.Vector2(0.94, -0.12), new THREE.Vector2(0.98, -0.25), new THREE.Vector2(1.02, -0.9), new THREE.Vector2(1.12, -1.7), new THREE.Vector2(1.28, -2.55)];
  torso.add(mesh("cos_robe", new THREE.LatheGeometry(robePts, 20).scale(1, 1, 0.8), cape));
  // scarf: a ring at the neck and two strips hanging down the chest
  const scarfRing = new THREE.TorusGeometry(0.4, 0.13, 7, 18).rotateX(Math.PI / 2).scale(1, 1, 0.82).translate(0, 1.6, 0.02);
  const scarfStrips = [-1, 1].map((s) => new THREE.BoxGeometry(0.3, 1.1, 0.1).translate(s * 0.17, 1.02, zF(1.02) + 0.1));
  torso.add(mesh("cos_scarf", merge(scarfRing, ...scarfStrips), costume2));
  // the suit: a white shirt front with a collar notch, a tie down to the belt, dark glasses and an earpiece. The shirt
  // and tie are flat decals bent to the torso (each vertex pushed to the front surface at its own height).
  const bend = (g: THREE.BufferGeometry, lift: number) => { const a = g.attributes.position as THREE.BufferAttribute; for (let i = 0; i < a.count; i++) a.setZ(i, zF(a.getY(i)) + lift); a.needsUpdate = true; g.computeVertexNormals(); return g; };
  const shirtShape = new THREE.Shape(); shirtShape.moveTo(-0.38, 1.68); shirtShape.lineTo(-0.13, 1.68); shirtShape.lineTo(0, 1.5); shirtShape.lineTo(0.13, 1.68); shirtShape.lineTo(0.38, 1.68); shirtShape.lineTo(0, 0.88); shirtShape.lineTo(-0.38, 1.68);
  torso.add(mesh("cos_shirtfront", bend(new THREE.ShapeGeometry(shirtShape, 6), 0.07), costume));
  const tieShape = new THREE.Shape(); tieShape.moveTo(-0.085, 1.56); tieShape.lineTo(0.085, 1.56); tieShape.lineTo(0.05, 1.42); tieShape.lineTo(0.11, 0.24); tieShape.lineTo(0, 0.04); tieShape.lineTo(-0.11, 0.24); tieShape.lineTo(-0.05, 1.42); tieShape.lineTo(-0.085, 1.56); // a knot that narrows downward, then the blade widening to its point
  torso.add(mesh("cos_tie", bend(new THREE.ShapeGeometry(tieShape, 8), 0.085), costume2));
  // dark glasses: two lenses with a bridge between them and an arm from each outer corner back to the ear, hooked
  // down behind it. Drawn round the eyes; AVATAR_SHADES says where the front and the arms are so the fit can seat them.
  const SH = AVATAR_SHADES, shY = hc + OLD_EYE.y;
  const lensShape = (s: number) => { const o = new THREE.Shape(); ([[-0.2, 0.1], [-0.17, 0.14], [0.17, 0.15], [0.215, 0.11], [0.2, -0.02], [0.15, -0.11], [0.02, -0.14], [-0.1, -0.13], [-0.18, -0.06]] as [number, number][]).forEach(([x, y], i) => (i ? o.lineTo(x, y) : o.moveTo(x, y))); const g = new THREE.ExtrudeGeometry(o, { depth: 0.03, bevelEnabled: false, curveSegments: 1 }); if (s < 0) { g.scale(-1, 1, 1); const ix = g.index ?? (g.setIndex([...Array(g.attributes.position.count).keys()]), g.index!); for (let i = 0; i < ix.count; i += 3) { const t = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, t); } } return g.rotateY(s * 0.14).translate(s * 0.27, shY, SH.z - 0.03); };
  const bridge = new THREE.BoxGeometry(0.2, 0.04, 0.03).translate(0, shY + 0.07, SH.z - 0.015);
  const arms = [-1, 1].flatMap((s) => [new THREE.BoxGeometry(0.025, 0.045, SH.len).translate(s * SH.x, shY + SH.y, SH.z - 0.04 - SH.len / 2), new THREE.BoxGeometry(0.025, 0.04, 0.2).translate(0, 0, -0.1).rotateX(-0.85).translate(s * SH.x, shY + SH.y, SH.z - 0.04 - SH.len)]);
  head.add(mesh("cos_shades", merge(...[lensShape(1), lensShape(-1), bridge, ...arms].map((g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute("uv"); return n; })), prop));
  // earpiece: a bud in the ear (AVATAR_EARBUD) and a coiled lead that runs down behind the lobe toward the collar
  const EB = AVATAR_EARBUD;
  const bud = sphere(0.055, 8, 6).scale(0.7, 1, 1).translate(...EB);
  const lead = new THREE.CatmullRomCurve3(([[0, -0.02, -0.02], [0.03, -0.14, -0.1], [-0.03, -0.34, -0.17], [-0.13, -0.66, -0.2]] as [number, number, number][]).map(([x, y, z]) => new THREE.Vector3(EB[0] + x, EB[1] + y, EB[2] + z)));
  const wire = new THREE.TubeGeometry(lead, 8, 0.016, 5, false);
  head.add(mesh("cos_earpiece", merge(bud, wire), costume2));
  // proton-style pack on the back: a box, a tank on its side and a hose stub
  const packBox = new THREE.BoxGeometry(1.05, 1.35, 0.5).translate(0, 0.62, -0.92);
  const packTank = new THREE.CylinderGeometry(0.2, 0.2, 0.95, 10).rotateZ(Math.PI / 2).translate(0, -0.1, -1.05);
  const packCore = new THREE.CylinderGeometry(0.17, 0.17, 0.32, 10).rotateX(Math.PI / 2).translate(0.3, 0.9, -1.28);
  const packStraps = [-1, 1].map((s) => new THREE.BoxGeometry(0.16, 1.3, 0.08).translate(s * 0.42, 0.95, zF(0.95) + 0.08));
  torso.add(mesh("cos_pack", merge(packBox, packTank, packCore, ...packStraps), prop));
  // carried in the right hand, pointing forward and a little down (the arm hangs): a hilt with a glowing blade, a wand, a blaster
  const handR = root.getObjectByName("hand_r")!;
  const carry = (g: THREE.BufferGeometry) => g.rotateX(CARRY.tilt).translate(...CARRY.offset);
  const hilt = new THREE.CylinderGeometry(0.062, 0.058, 0.75, 10).rotateX(Math.PI / 2).translate(0, 0, 0.1);
  const emitter = new THREE.CylinderGeometry(0.08, 0.062, 0.1, 10).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  handR.add(mesh("cos_saber", carry(merge(hilt, emitter)), prop));
  const blade = new THREE.CapsuleGeometry(0.05, 2.5, 3, 8).rotateX(Math.PI / 2).translate(0, 0, 1.8);
  handR.add(mesh("cos_saber_blade", carry(blade), glow));
  handR.add(mesh("cos_wand", carry(new THREE.CylinderGeometry(0.022, 0.04, 1.15, 7).rotateX(Math.PI / 2).translate(0, 0, 0.55)), prop));
  const blasterBody = new THREE.BoxGeometry(0.14, 0.16, 0.9).translate(0, 0.02, 0.45), blasterGrip = new THREE.BoxGeometry(0.1, 0.3, 0.12).translate(0, -0.2, 0.1), blasterBarrel = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8).rotateX(Math.PI / 2).translate(0, 0.03, 1.1);
  handR.add(mesh("cos_blaster", carry(merge(blasterBody, blasterGrip, blasterBarrel)), prop));
  handR.add(mesh("cos_blaster_tip", carry(sphere(0.07, 8, 6).translate(0, 0.03, 1.36)), glow));
  return root;
}

/** Materials recoloured per figure at runtime (by material name). */
export const RECOLOR_MATERIALS = ["skin", "hair", "brow", "shirt", "pants", "costume", "costume2", "cape", "prop", "glow"] as const; // brow: the skinned body's eyebrows, hair-coloured
export interface AvatarLook { body: "a" | "b"; skin: string; hair: string; hairColor: string; shirt: string; pants: string; costume?: string }
/**
 * Shows the right hair and costume parts on a built or loaded avatar and returns
 * the colour per recolourable material. Used by the GLB rig, the fallback and the
 * dev page so every path looks the same.
 */
export function applyAvatarLook(root: THREE.Object3D, look: AvatarLook): Record<string, string> {
  const costume = isCostumeId(look.costume) ? COSTUMES[look.costume] : COSTUMES.none;
  const parts = new Set<string>(costume.parts);
  const hasChest = parts.has("cos_chest") || parts.has("cos_emblem_star") || parts.has("cos_emblem_bolt") || parts.has("cos_emblem_ring") || parts.has("cos_tie"); // a tie and a lanyard would overlap
  root.traverse((o) => {
    if ((HAIR_NODES as readonly string[]).includes(o.name)) o.visible = !costume.hideHair && o.name === `hair_${look.hair}`;
    else if ((COSTUME_PARTS as readonly string[]).includes(o.name)) o.visible = parts.has(o.name);
    else if (o.name === "cos_helmet_visor") o.visible = parts.has("cos_helmet");
    else if (o.name === "cos_saber_blade") o.visible = parts.has("cos_saber");
    else if (o.name === "cos_blaster_tip") o.visible = parts.has("cos_blaster");
    else if (o.name === "badge" || o.name === "lanyard_m") o.visible = !hasChest; // the emblem or plate takes the badge's place
  });
  const dressed = look.costume && look.costume !== "none";
  return {
    skin: look.skin, hair: look.hairColor, brow: look.hairColor,
    shirt: dressed && costume.colors.shirt ? costume.colors.shirt : look.shirt,
    pants: dressed && costume.colors.pants ? costume.colors.pants : look.pants,
    costume: costume.colors.costume, costume2: costume.colors.costume2, cape: costume.colors.cape,
    prop: costume.colors.prop ?? "#4b5563", glow: costume.colors.glow ?? "#60a5fa",
  };
}

/** How a carried prop, modelled along +z from its handle, is set into the procedural figure's hanging hand; the real body undoes this and seats it in its own grip. */
export const CARRY = { tilt: 0.55, offset: [0, -0.22, 0.14] as [number, number, number] };

/** Which hair node to show for a hair style; the rest are hidden at runtime ("bald" shows none). */
export const HAIR_NODES = ["hair_short", "hair_long", "hair_buzz", "hair_bun", "hair_curly"] as const;

/* ---------- clips ---------- */

const e = (x: number, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
function qTrack(node: string, duration: number, samples: number, f: (t: number) => THREE.Quaternion): THREE.QuaternionKeyframeTrack {
  const times: number[] = [], values: number[] = [];
  for (let i = 0; i <= samples; i++) { const t = i / samples; const q = f(t); times.push(t * duration); values.push(q.x, q.y, q.z, q.w); }
  return new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, times, values);
}
function pTrack(node: string, duration: number, samples: number, base: [number, number, number], f: (t: number) => [number, number, number]): THREE.VectorKeyframeTrack {
  const times: number[] = [], values: number[] = [];
  for (let i = 0; i <= samples; i++) { const t = i / samples; const d = f(t); times.push(t * duration); values.push(base[0] + d[0], base[1] + d[1], base[2] + d[2]); }
  return new THREE.VectorKeyframeTrack(`${node}.position`, times, values);
}
const S = (t: number, ph = 0) => Math.sin(t * Math.PI * 2 + ph);
const pos = (x: number) => Math.max(0, x);
const HIPS: [number, number, number] = [0, 3.0, 0];

/**
 * idle / walk / run clips keyed to the node names above. Looping, one cycle each.
 * Sign conventions (figure faces +z): +x rotation on a thigh swings the foot
 * back, +x on a shin bends the knee, -x on a forearm bends the elbow, +x on a
 * shoe points the toe down.
 */
export function buildAvatarClips(): THREE.AnimationClip[] {
  const N = 24;
  const gait = (name: string, dur: number, amp: number, lean: number, bob: number, elbow: number, armAmp: number, knee: number) => {
    const swing = (t: number, s: 1 | -1) => S(t) * s * amp; // left leg back at t = 0.25
    const flex = (t: number, s: 1 | -1) => pos(S(t, s === 1 ? -1.26 : -1.26 + Math.PI)); // knee bends while that leg swings forward
    return new THREE.AnimationClip(name, dur, [
      qTrack("thigh_l", dur, N, (t) => e(swing(t, 1) - 0.08)),
      qTrack("thigh_r", dur, N, (t) => e(swing(t, -1) - 0.08)),
      qTrack("shin_l", dur, N, (t) => e(flex(t, 1) * knee + 0.1)),
      qTrack("shin_r", dur, N, (t) => e(flex(t, -1) * knee + 0.1)),
      qTrack("shoe_l", dur, N, (t) => e(pos(S(t, 0.4)) ** 2 * 0.45 - pos(-S(t)) * 0.12)),
      qTrack("shoe_r", dur, N, (t) => e(pos(-S(t, 0.4)) ** 2 * 0.45 - pos(S(t)) * 0.12)),
      qTrack("shoulder_l", dur, N, (t) => e(-S(t) * armAmp, 0, -0.14)),
      qTrack("shoulder_r", dur, N, (t) => e(S(t) * armAmp, 0, 0.14)),
      qTrack("forearm_l", dur, N, (t) => e(-elbow - pos(-S(t)) * armAmp * 0.6)),
      qTrack("forearm_r", dur, N, (t) => e(-elbow - pos(S(t)) * armAmp * 0.6)),
      qTrack("torso", dur, N, (t) => e(lean, S(t) * 0.09, -S(t) * 0.025)),
      qTrack("head", dur, N, (t) => e(-lean * 0.7 + S(t * 2, 1) * 0.02, -S(t) * 0.06, 0)),
      qTrack("hips", dur, N, (t) => e(0, -S(t) * 0.05, S(t) * 0.04)),
      pTrack("hips", dur, N, HIPS, (t) => [S(t) * 0.03, Math.cos(t * Math.PI * 4) * bob * 0.5, 0]),
    ]);
  };
  const D = 3.4;
  const idle = new THREE.AnimationClip("idle", D, [
    pTrack("hips", D, 32, HIPS, (t) => [S(t) * 0.025, S(t * 2, 0.5) * 0.015, 0]),
    qTrack("hips", D, 32, (t) => e(0, 0, S(t) * 0.02)),
    qTrack("torso", D, 32, (t) => e(0.03 + S(t * 2, 0.5) * 0.015, -S(t) * 0.03, -S(t) * 0.02)),
    // look about: a slow sweep with a pause, plus a small nod
    qTrack("head", D, 32, (t) => e(S(t * 2, 1.2) * 0.03, Math.sin(S(t) * 1.4) * 0.22, S(t, 0.6) * 0.03)),
    qTrack("shoulder_l", D, 32, (t) => e(0.06 + S(t * 2, 0.5) * 0.025, 0, -0.16 - S(t) * 0.01)),
    qTrack("shoulder_r", D, 32, (t) => e(0.06 - S(t * 2, 0.5) * 0.025, 0, 0.16 + S(t) * 0.01)),
    qTrack("forearm_l", D, 32, (t) => e(-0.28 - S(t * 2, 0.5) * 0.02, 0.1, 0)),
    qTrack("forearm_r", D, 32, (t) => e(-0.28 - S(t * 2, 0.5) * 0.02, -0.1, 0)),
    qTrack("thigh_l", D, 32, (t) => e(-0.02 + S(t) * 0.015, 0, -0.03)), qTrack("thigh_r", D, 32, (t) => e(-0.02 - S(t) * 0.015, 0, 0.03)),
    qTrack("shin_l", D, 32, () => e(0.05)), qTrack("shin_r", D, 32, () => e(0.05)),
    qTrack("shoe_l", D, 32, () => e(0)), qTrack("shoe_r", D, 32, () => e(0)),
  ]);
  // seated: hips dropped to chair height (seat tops are about 1.5 ft), thighs level, shins down, hands in the lap, a slow look-about
  const sit = new THREE.AnimationClip("sit", D, [
    pTrack("hips", D, 32, HIPS, (t) => [0, -1.35 + S(t * 2, 0.5) * 0.01, 0.15]),
    qTrack("hips", D, 32, () => e(0, 0, 0)),
    qTrack("torso", D, 32, (t) => e(0.08 + S(t * 2, 0.5) * 0.012, -S(t) * 0.03, 0)),
    qTrack("head", D, 32, (t) => e(-0.04 + S(t * 2, 1.2) * 0.03, Math.sin(S(t) * 1.4) * 0.2, 0)),
    qTrack("shoulder_l", D, 32, (t) => e(0.55 + S(t * 2, 0.5) * 0.02, 0, -0.2)), qTrack("shoulder_r", D, 32, (t) => e(0.55 - S(t * 2, 0.5) * 0.02, 0, 0.2)),
    qTrack("forearm_l", D, 32, () => e(-0.9, 0.35, 0)), qTrack("forearm_r", D, 32, () => e(-0.9, -0.35, 0)),
    qTrack("thigh_l", D, 32, () => e(-1.5, 0, -0.06)), qTrack("thigh_r", D, 32, () => e(-1.5, 0, 0.06)),
    qTrack("shin_l", D, 32, () => e(1.45)), qTrack("shin_r", D, 32, () => e(1.45)),
    qTrack("shoe_l", D, 32, () => e(0.1)), qTrack("shoe_r", D, 32, () => e(0.1)),
  ]);
  return [idle, gait("walk", 1.0, 0.5, 0.05, 0.07, 0.4, 0.42, 1.0), gait("run", 0.6, 0.9, 0.2, 0.13, 1.25, 0.85, 1.5), sit, ...buildEmoteClips()];
}

/** Emotes people can trigger: one-shot clips, all bones keyed so they read cleanly over whatever was playing. */
export const EMOTES = [
  { id: "wave", label: "Wave", icon: "👋" },
  { id: "dance", label: "Dance", icon: "🕺" },
  { id: "cheer", label: "Cheer", icon: "🙌" },
  { id: "clap", label: "Clap", icon: "👏" },
  { id: "bow", label: "Bow", icon: "🙇" },
  { id: "point", label: "Point", icon: "👉" },
  { id: "laugh", label: "Laugh", icon: "😂" },
  { id: "facepalm", label: "Facepalm", icon: "🤦" },
] as const;
export type EmoteId = (typeof EMOTES)[number]["id"];
export const isEmoteId = (s: unknown): s is EmoteId => typeof s === "string" && EMOTES.some((e) => e.id === s);

function buildEmoteClips(): THREE.AnimationClip[] {
  const N = 32;
  // an easing that holds a pose in the middle of the clip: 0 → 1 → 0
  const hold = (t: number, inT = 0.18, outT = 0.82) => (t < inT ? t / inT : t > outT ? (1 - t) / (1 - outT) : 1);
  const smooth = (x: number) => x * x * (3 - 2 * x);
  const legs = (dur: number, knee = 0.05) => [
    qTrack("thigh_l", dur, N, () => e(-0.02, 0, -0.03)), qTrack("thigh_r", dur, N, () => e(-0.02, 0, 0.03)),
    qTrack("shin_l", dur, N, () => e(knee)), qTrack("shin_r", dur, N, () => e(knee)),
    qTrack("shoe_l", dur, N, () => e(0)), qTrack("shoe_r", dur, N, () => e(0)),
  ];
  const clip = (name: string, dur: number, tracks: THREE.KeyframeTrack[]) => new THREE.AnimationClip(name, dur, tracks);
  const wave = (() => { const D = 2.2; return clip("wave", D, [
    ...legs(D),
    pTrack("hips", D, N, HIPS, () => [0, 0, 0]), qTrack("hips", D, N, () => e(0, 0, 0)),
    qTrack("torso", D, N, (t) => e(0.02, -0.08 * smooth(hold(t)), -0.04 * smooth(hold(t)))),
    qTrack("head", D, N, (t) => e(-0.05 * hold(t), -0.12 * hold(t), 0.1 * hold(t))),
    qTrack("shoulder_l", D, N, () => e(0.06, 0, -0.16)), qTrack("forearm_l", D, N, () => e(-0.28, 0.1, 0)),
    // right arm up beside the head, forearm swinging side to side
    qTrack("shoulder_r", D, N, (t) => e(-2.6 * smooth(hold(t)), 0, 0.5 * smooth(hold(t)))),
    qTrack("forearm_r", D, N, (t) => e(-0.5 * smooth(hold(t)), 0, -S(t * 3) * 0.55 * hold(t))),
  ]); })();
  const dance = (() => { const D = 2.6; const b = (t: number) => S(t * 4); return clip("dance", D, [
    qTrack("thigh_l", D, N, (t) => e(-0.1 + pos(b(t)) * 0.25, 0, -0.08)), qTrack("thigh_r", D, N, (t) => e(-0.1 + pos(-b(t)) * 0.25, 0, 0.08)),
    qTrack("shin_l", D, N, (t) => e(0.1 + pos(b(t)) * 0.35)), qTrack("shin_r", D, N, (t) => e(0.1 + pos(-b(t)) * 0.35)),
    qTrack("shoe_l", D, N, () => e(0)), qTrack("shoe_r", D, N, () => e(0)),
    pTrack("hips", D, N, HIPS, (t) => [S(t * 2) * 0.12, -Math.abs(b(t)) * 0.08, 0]),
    qTrack("hips", D, N, (t) => e(0, S(t * 2) * 0.25, b(t) * 0.08)),
    qTrack("torso", D, N, (t) => e(0.05, -S(t * 2) * 0.3, -b(t) * 0.1)),
    qTrack("head", D, N, (t) => e(S(t * 4, 1) * 0.12, S(t * 2) * 0.3, 0)),
    qTrack("shoulder_l", D, N, (t) => e(-1.2 - pos(b(t)) * 1.3, 0, -0.35)), qTrack("shoulder_r", D, N, (t) => e(-1.2 - pos(-b(t)) * 1.3, 0, 0.35)),
    qTrack("forearm_l", D, N, (t) => e(-1.1 + pos(b(t)) * 0.4, 0.2, 0)), qTrack("forearm_r", D, N, (t) => e(-1.1 + pos(-b(t)) * 0.4, -0.2, 0)),
  ]); })();
  const cheer = (() => { const D = 1.8; const up = (t: number) => smooth(hold(t, 0.2, 0.75)); return clip("cheer", D, [
    ...legs(D, 0.08),
    pTrack("hips", D, N, HIPS, (t) => [0, pos(S(t * 2, -0.3)) * 0.22 * up(t), 0]),
    qTrack("hips", D, N, () => e(0, 0, 0)),
    qTrack("torso", D, N, (t) => e(-0.12 * up(t), 0, 0)),
    qTrack("head", D, N, (t) => e(-0.3 * up(t), 0, 0)),
    qTrack("shoulder_l", D, N, (t) => e(-2.9 * up(t), 0, -0.5 * up(t) - 0.16)), qTrack("shoulder_r", D, N, (t) => e(-2.9 * up(t), 0, 0.5 * up(t) + 0.16)),
    qTrack("forearm_l", D, N, (t) => e(-0.3 - S(t * 4) * 0.2 * up(t), 0, 0)), qTrack("forearm_r", D, N, (t) => e(-0.3 + S(t * 4) * 0.2 * up(t), 0, 0)),
  ]); })();
  const clap = (() => { const D = 2.0; const h = (t: number) => smooth(hold(t, 0.15, 0.85)); const c = (t: number) => pos(S(t * 5)); return clip("clap", D, [
    ...legs(D),
    pTrack("hips", D, N, HIPS, () => [0, 0, 0]), qTrack("hips", D, N, () => e(0, 0, 0)),
    qTrack("torso", D, N, (t) => e(0.08 * h(t), 0, 0)),
    qTrack("head", D, N, (t) => e(0.05 * h(t) + S(t * 5) * 0.02 * h(t), 0, 0)),
    // forearms up in front, hands clapping together: the swing is around the vertical axis
    qTrack("shoulder_l", D, N, (t) => e(-0.9 * h(t), 0, -0.16 - 0.25 * h(t))), qTrack("shoulder_r", D, N, (t) => e(-0.9 * h(t), 0, 0.16 + 0.25 * h(t))),
    qTrack("forearm_l", D, N, (t) => e(-1.5 * h(t), 0.55 * h(t) - c(t) * 0.5 * h(t), 0)), qTrack("forearm_r", D, N, (t) => e(-1.5 * h(t), -0.55 * h(t) + c(t) * 0.5 * h(t), 0)),
  ]); })();
  const bow = (() => { const D = 2.4; const b = (t: number) => smooth(hold(t, 0.3, 0.7)); return clip("bow", D, [
    ...legs(D),
    pTrack("hips", D, N, HIPS, (t) => [0, -0.05 * b(t), 0]), qTrack("hips", D, N, () => e(0, 0, 0)),
    qTrack("torso", D, N, (t) => e(0.85 * b(t), 0, 0)),
    qTrack("head", D, N, (t) => e(0.35 * b(t), 0, 0)),
    qTrack("shoulder_l", D, N, (t) => e(0.3 * b(t), 0, -0.16)), qTrack("shoulder_r", D, N, (t) => e(0.3 * b(t), 0, 0.16)),
    qTrack("forearm_l", D, N, (t) => e(-0.28 - 0.2 * b(t), 0.1, 0)), qTrack("forearm_r", D, N, (t) => e(-0.28 - 0.2 * b(t), -0.1, 0)),
  ]); })();
  const point = (() => { const D = 1.9; const h = (t: number) => smooth(hold(t, 0.2, 0.8)); return clip("point", D, [
    ...legs(D),
    pTrack("hips", D, N, HIPS, () => [0, 0, 0]), qTrack("hips", D, N, (t) => e(0, -0.1 * h(t), 0)),
    qTrack("torso", D, N, (t) => e(0.03, -0.2 * h(t), 0)),
    qTrack("head", D, N, (t) => e(-0.05 * h(t), -0.25 * h(t), 0)),
    qTrack("shoulder_l", D, N, () => e(0.06, 0, -0.16)), qTrack("forearm_l", D, N, () => e(-0.28, 0.1, 0)),
    qTrack("shoulder_r", D, N, (t) => e(-1.55 * h(t), 0.3 * h(t), 0.16)), qTrack("forearm_r", D, N, (t) => e(-0.05 * h(t) - 0.28 * (1 - h(t)), 0, 0)),
  ]); })();
  const laugh = (() => { const D = 2.0; const h = (t: number) => smooth(hold(t, 0.15, 0.85)); const j = (t: number) => S(t * 6); return clip("laugh", D, [
    ...legs(D),
    pTrack("hips", D, N, HIPS, (t) => [0, j(t) * 0.02 * h(t), 0]), qTrack("hips", D, N, () => e(0, 0, 0)),
    qTrack("torso", D, N, (t) => e(-0.22 * h(t) + j(t) * 0.04 * h(t), 0, 0)),
    qTrack("head", D, N, (t) => e(-0.4 * h(t) + j(t) * 0.05 * h(t), 0, 0.06 * h(t))),
    qTrack("shoulder_l", D, N, (t) => e(0.3 * h(t) + j(t) * 0.08 * h(t), 0, -0.3 * h(t) - 0.16)), qTrack("shoulder_r", D, N, (t) => e(0.3 * h(t) + j(t) * 0.08 * h(t), 0, 0.3 * h(t) + 0.16)),
    qTrack("forearm_l", D, N, (t) => e(-1.3 * h(t) - 0.28 * (1 - h(t)), 0.1, 0)), qTrack("forearm_r", D, N, (t) => e(-1.3 * h(t) - 0.28 * (1 - h(t)), -0.1, 0)),
  ]); })();
  const facepalm = (() => { const D = 2.2; const h = (t: number) => smooth(hold(t, 0.2, 0.75)); return clip("facepalm", D, [
    ...legs(D),
    pTrack("hips", D, N, HIPS, () => [0, 0, 0]), qTrack("hips", D, N, () => e(0, 0, 0)),
    qTrack("torso", D, N, (t) => e(0.12 * h(t), 0, 0)),
    qTrack("head", D, N, (t) => e(0.45 * h(t), 0, 0.08 * h(t))),
    qTrack("shoulder_l", D, N, () => e(0.06, 0, -0.16)), qTrack("forearm_l", D, N, () => e(-0.28, 0.1, 0)),
    qTrack("shoulder_r", D, N, (t) => e(-1.0 * h(t), 0.35 * h(t), 0.16)), qTrack("forearm_r", D, N, (t) => e(-2.5 * h(t) - 0.28 * (1 - h(t)), 0.35 * h(t), 0)),
  ]); })();
  return [wave, dance, cheer, clap, bow, point, laugh, facepalm];
}
