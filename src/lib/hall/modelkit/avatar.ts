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
  g.fillStyle = "#c68642"; g.fillRect(10, 36, 30, 36);
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

export function buildAvatar(body: BodyType): THREE.Group {
  const wide = body === "a";
  // body a: broad shoulders, straight hips. body b: narrower shoulders, fuller hips, slimmer limbs.
  const shoulderF = wide ? 1.12 : 0.9, hipF = wide ? 0.96 : 1.06, waistF = wide ? 1 : 0.92, limbF = wide ? 1 : 0.92;

  const skin = mat("skin", "#c68642"), hair = mat("hair", "#2b1b12", { roughness: 0.55, side: THREE.DoubleSide });
  const shirt = mat("shirt", "#e63946", { roughness: 0.85 }), pants = mat("pants", "#1f2a44", { roughness: 0.9 });
  const shoes = mat("shoes", "#1b1b1f", { roughness: 0.5 }), badge = mat("badge", "#ffffff", { roughness: 0.35, map: badgeTexture() });
  const lanyard = mat("lanyard", "#111827", { roughness: 0.8 }), sole = mat("sole", "#e5e7eb", { roughness: 0.6 });
  const face = mat("face", "#ffffff", { map: faceTexture(), transparent: true, roughness: 0.6 });
  // cosplay materials: recoloured per preset at runtime
  const costume = mat("costume", "#b91c1c", { roughness: 0.45, metalness: 0.15 }), costume2 = mat("costume2", "#facc15", { roughness: 0.4, metalness: 0.2, emissive: "#000000" });
  const cape = mat("cape", "#b91c1c", { roughness: 0.9, side: THREE.DoubleSide });
  const lens = mat("lens", "#f8fafc", { roughness: 0.3, metalness: 0, emissive: "#ffffff", emissiveIntensity: 0.35 }); // the white eyes of a cowl

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
  // domino mask: a band round the eyes
  head.add(mesh("cos_mask", new THREE.SphereGeometry(HEAD_R + 0.025, 16, 6, Math.PI / 2 - 1.15, 2.3, 1.0, 0.36).scale(...HEAD_SCALE), costume2, 0, hc, 0));
  // cowl: crown, sides and back of the head, a band across the eyes, two ears; the nose, mouth and chin stay open,
  // and white lenses sit over the eyes (the sphere's front is phi = π/2)
  const cowlCrown = new THREE.SphereGeometry(HEAD_R + 0.03, 20, 8, 0, Math.PI * 2, 0, 0.98).scale(...HEAD_SCALE).translate(0, hc, 0);
  const cowlBack = new THREE.SphereGeometry(HEAD_R + 0.03, 20, 12, Math.PI / 2 + 1.0, Math.PI * 2 - 2.0, 0.9, 1.25).scale(...HEAD_SCALE).translate(0, hc, 0);
  const cowlBand = new THREE.SphereGeometry(HEAD_R + 0.03, 16, 6, Math.PI / 2 - 1.1, 2.2, 0.9, 0.5).scale(...HEAD_SCALE).translate(0, hc, 0);
  const ears2 = [-1, 1].map((s) => new THREE.ConeGeometry(0.16, 0.42, 6).translate(s * 0.4, hc + 0.78, -0.1));
  head.add(mesh("cos_cowl", merge(cowlCrown, cowlBack, cowlBand, ...ears2), costume));
  const lensGeo = [-1, 1].map((s) => sphere(0.1, 10, 6).scale(1.5, 0.85, 0.45).translate(s * 0.26, hc + 0.12, (HEAD_R + 0.03) * HEAD_SCALE[2] * 0.94));
  head.add(mesh("cos_cowl_eyes", merge(...lensGeo), lens));
  // full helmet with a visor slot at eye height
  const shell = new THREE.SphereGeometry(HEAD_R + 0.07, 22, 14, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI).scale(...HEAD_SCALE).translate(0, hc, 0);
  const crown = new THREE.SphereGeometry(HEAD_R + 0.07, 22, 10, 0, Math.PI * 2, 0, 0.95).scale(...HEAD_SCALE).translate(0, hc, 0);
  const chin = new THREE.SphereGeometry(HEAD_R + 0.07, 22, 8, 0, Math.PI * 2, 2.05, 1.1).scale(...HEAD_SCALE).translate(0, hc, 0);
  head.add(mesh("cos_helmet", merge(shell, crown, chin), costume));
  head.add(mesh("cos_helmet_visor", new THREE.SphereGeometry(HEAD_R + 0.075, 18, 6, Math.PI / 2 - 1.0, 2.0, 0.95, 0.5).scale(...HEAD_SCALE), costume2, 0, hc, 0));
  // pointed hat with a brim
  const cone = new THREE.ConeGeometry(0.62, 1.7, 14).translate(0, hc + 1.1, -0.05).rotateX(-0.12);
  const brim = new THREE.CylinderGeometry(1.15, 1.15, 0.06, 20).translate(0, hc + 0.36, -0.05);
  head.add(mesh("cos_hat", merge(cone, brim), costume));
  // antenna headband
  const band = new THREE.TorusGeometry(HEAD_R + 0.02, 0.05, 6, 20).rotateX(Math.PI / 2).scale(1, 1, 0.96).translate(0, hc + 0.32, 0);
  const stalks = [-1, 1].flatMap((s) => [new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6).translate(s * 0.35, hc + 0.95, 0), sphere(0.09, 8, 6).translate(s * 0.35, hc + 1.32, 0)]);
  head.add(mesh("cos_antenna", merge(band, ...stalks), costume2));
  // chest plate hugging the torso front, with a collar ridge
  const plate = new THREE.CylinderGeometry(R(1.4) + 0.05, R(0.1) + 0.05, 1.35, 14, 1, false, -0.95, 1.9).scale(1, 1, 0.76).translate(0, 0.78, 0);
  const collar = new THREE.TorusGeometry(0.42, 0.06, 6, 16).rotateX(Math.PI / 2).translate(0, 1.6, 0);
  torso.add(mesh("cos_chest", merge(plate, collar), costume));
  // shoulder pads
  const pads = [-1, 1].map((s) => sphere(0.4, 12, 8).scale(1, 0.7, 1).translate(s * (R(1.35) + 0.04), 1.48, 0));
  torso.add(mesh("cos_pads", merge(...pads), costume));
  // belt with a buckle
  const beltRing = new THREE.TorusGeometry(R(-0.2) + 0.02, 0.09, 6, 22).rotateX(Math.PI / 2).scale(1, 1, 0.74).translate(0, -0.2, 0);
  const buckle = new THREE.BoxGeometry(0.34, 0.26, 0.08).translate(0, -0.2, zF(-0.2) + 0.1);
  torso.add(mesh("cos_belt", merge(beltRing, buckle), costume2));
  // chest emblems (flat decals above the pocket)
  const emblemY = 1.05, emblemZ = zF(emblemY) + 0.07;
  const starShape = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.15 : 0.34, a = Math.PI / 2 + (i / 10) * Math.PI * 2; if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  torso.add(mesh("cos_emblem_star", new THREE.ShapeGeometry(starShape).translate(0, emblemY, emblemZ), costume2));
  const bolt = new THREE.Shape(); bolt.moveTo(0.06, 0.36); bolt.lineTo(-0.2, 0.02); bolt.lineTo(-0.02, 0.02); bolt.lineTo(-0.12, -0.36); bolt.lineTo(0.2, 0.06); bolt.lineTo(0.02, 0.06); bolt.lineTo(0.06, 0.36);
  torso.add(mesh("cos_emblem_bolt", new THREE.ShapeGeometry(bolt).translate(0, emblemY, emblemZ), costume2));
  torso.add(mesh("cos_emblem_ring", new THREE.RingGeometry(0.16, 0.3, 24).translate(0, emblemY, emblemZ), costume2));
  return root;
}

/** Materials recoloured per figure at runtime (by material name). */
export const RECOLOR_MATERIALS = ["skin", "hair", "shirt", "pants", "costume", "costume2", "cape"] as const;
export interface AvatarLook { body: "a" | "b"; skin: string; hair: string; hairColor: string; shirt: string; pants: string; costume?: string }
/**
 * Shows the right hair and costume parts on a built or loaded avatar and returns
 * the colour per recolourable material. Used by the GLB rig, the fallback and the
 * dev page so every path looks the same.
 */
export function applyAvatarLook(root: THREE.Object3D, look: AvatarLook): Record<string, string> {
  const costume = isCostumeId(look.costume) ? COSTUMES[look.costume] : COSTUMES.none;
  const parts = new Set<string>(costume.parts);
  const hasChest = parts.has("cos_chest") || parts.has("cos_emblem_star") || parts.has("cos_emblem_bolt") || parts.has("cos_emblem_ring");
  root.traverse((o) => {
    if ((HAIR_NODES as readonly string[]).includes(o.name)) o.visible = !costume.hideHair && o.name === `hair_${look.hair}`;
    else if ((COSTUME_PARTS as readonly string[]).includes(o.name)) o.visible = parts.has(o.name);
    else if (o.name === "cos_helmet_visor") o.visible = parts.has("cos_helmet");
    else if (o.name === "badge" || o.name === "lanyard_m") o.visible = !hasChest; // the emblem or plate takes the badge's place
  });
  const dressed = look.costume && look.costume !== "none";
  return {
    skin: look.skin, hair: look.hairColor,
    shirt: dressed && costume.colors.shirt ? costume.colors.shirt : look.shirt,
    pants: dressed && costume.colors.pants ? costume.colors.pants : look.pants,
    costume: costume.colors.costume, costume2: costume.colors.costume2, cape: costume.colors.cape,
  };
}

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
