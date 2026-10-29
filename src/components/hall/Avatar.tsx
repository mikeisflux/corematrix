"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useHall, type AvatarConfig, DEFAULT_AVATAR, SKIN_TONES, HAIR_COLORS, OUTFIT_COLORS } from "@/lib/hall/store";
import { hallLayout, standPoint, boothSpace, X0, Z0, HALL_LENGTH, HALL_DEPTH, Z_FRONT, Z_BACK, Z_CROSS0, Z_CROSS1, ARCADE, PITCH, SLOT, AISLE_W, type BoothSpace } from "@/lib/hall/layout";
import { AvatarRig, useModelUrl, wantedClip, ONESHOT, type Motion } from "./models";
import { buildAvatar, buildAvatarClips, applyAvatarLook, RECOLOR_MATERIALS } from "@/lib/hall/modelkit/avatar";
import { CROWD_COSTUMES } from "@/lib/hall/costumes";
import { Html } from "@react-three/drei";
import { live, type LivePlayer } from "@/lib/hall/live";
import { getPrefs } from "@/lib/hall/prefs";
import { perf } from "@/lib/hall/perf";
import { conbot } from "@/lib/hall/conbot";
import { nearestSeat, seating, type Seat } from "@/lib/hall/seats";
import { social, bumpSocial, useSocial } from "@/lib/hall/social";
import { EMOTES } from "@/lib/hall/modelkit/avatar";
import { Suspense } from "react";

/** Shared input state written by the HUD joystick and read every frame (no React re-renders). */
export const input = { joy: { x: 0, y: 0 }, run: false, yawDrag: 0, pitchDrag: 0 };
/** Where the walker is, for things that react to the player (ConBot) without going through React. */
export const player = { x: 0, z: 0, h: 0, seated: false };
/** The walker's animation state; the emote panel and number keys write emotes into it. */
export const playerMotion: Motion = { speed: 0, emote: null, sit: false };
/**
 * Held keys, self-healing. Browsers sometimes lose a keyup (focus jumps to a
 * find bar, a menu, another window), which would leave the figure walking
 * forever. Every keydown auto-repeat refreshes the key's timestamp; once we've
 * seen the OS repeat at all, a key that stops repeating for 1.2 s counts as
 * released. Focus loss or a hidden tab releases everything.
 */
const keys = new Map<string, number>();
let repeatSeen = false;
const GAME_KEYS = new Set(["w", "a", "s", "d", "q", "e", "v", "shift", "arrowup", "arrowdown", "arrowleft", "arrowright", " ", "'", "/"]);
function isDown(k: string): boolean {
  const t = keys.get(k);
  if (t === undefined) return false;
  if (repeatSeen && performance.now() - t > 1200) { keys.delete(k); return false; }
  return true;
}
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement; if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.tagName === "SELECT" || t?.isContentEditable) return;
    const k = e.key.toLowerCase();
    if (e.repeat) repeatSeen = true;
    // claim the game keys so the browser doesn't treat them as typing (Firefox find-as-you-type, page scroll on arrows)
    if (GAME_KEYS.has(k) && !e.ctrlKey && !e.metaKey && !e.altKey && useHall.getState().mode === "walk") e.preventDefault();
    if (k === "escape" || k === " ") { keys.clear(); return; } // full stop
    keys.set(k, performance.now());
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  const release = () => keys.clear();
  window.addEventListener("blur", release);
  document.addEventListener("visibilitychange", () => { if (document.hidden) release(); });
}

/* ---------- collision grid over booth rectangles ---------- */
const CELL = 20;
let grid: Map<string, BoothSpace[]> | null = null;
function cells() {
  if (grid) return grid;
  grid = new Map();
  for (const b of hallLayout()) {
    const x0 = Math.floor((b.x - b.w / 2) / CELL), x1 = Math.floor((b.x + b.w / 2) / CELL), z0 = Math.floor((b.z - b.d / 2) / CELL), z1 = Math.floor((b.z + b.d / 2) / CELL);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const k = `${i},${j}`; const arr = grid.get(k) ?? []; arr.push(b); grid.set(k, arr); }
  }
  return grid;
}
const R = 1.1; // body radius
function blocked(x: number, z: number): boolean {
  if (x < X0 + 2 || x > X0 + HALL_LENGTH - 2 || z < Z0 + 2 || z > Z0 + HALL_DEPTH - 2) return true;
  for (const b of cells().get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
    if (Math.abs(x - b.x) < b.w / 2 + R && Math.abs(z - b.z) < b.d / 2 + R) return true;
  }
  // the plaza is open floor except the cabinet rows, the stage, the flyover pad and the corner pillars
  for (const row of CABINET_ROWS) if (Math.abs(x - row.x) < row.w / 2 + R && Math.abs(z - row.z) < row.d / 2 + R) return true;
  for (const o of PLAZA_BLOCKS) if (Math.abs(x - o.x) < o.w / 2 + R && Math.abs(z - o.z) < o.d / 2 + R) return true;
  if (Math.hypot(x - ARCADE.x, z - ARCADE.z) < PAD_RADIUS + R) return true;
  return false;
}
/** Theater benches in front of the stage (same numbers as Arcade.tsx): two rows, two benches each, an aisle down the middle. */
export const BENCHES = [21.5, 26].flatMap((dz) => [-8, 8].map((dx) => ({ x: ARCADE.x + dx, z: ARCADE.z + dz, w: 12, d: 1.6 })));
/** Solid things on the plaza besides the cabinets (same numbers as Arcade.tsx): the stage with its scoreboard, and the pillars at the corners. */
const PLAZA_BLOCKS = [
  { x: ARCADE.x, z: ARCADE.z + ARCADE.d / 2 - 8, w: 36.4, d: 10.6 },
  ...BENCHES,
  ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ x: ARCADE.x + (sx * ARCADE.w) / 2, z: ARCADE.z + (sz * ARCADE.d) / 2, w: 2.2, d: 2.2 })),
];
const PAD_RADIUS = 7.6; // the flyover pad plus its ride sign
export const CABINET_ROWS = [
  { x: ARCADE.x - 24, z: ARCADE.z - 18, w: 3, d: 30 }, { x: ARCADE.x - 24, z: ARCADE.z + 18, w: 3, d: 30 },
  { x: ARCADE.x + 24, z: ARCADE.z - 18, w: 3, d: 30 }, { x: ARCADE.x + 24, z: ARCADE.z + 18, w: 3, d: 30 },
  { x: ARCADE.x, z: ARCADE.z - 34, w: 30, d: 3 }, // the back of the plaza is the theater: stage, screen and benches instead of a cabinet row
];
export function isBlocked(x: number, z: number) { return blocked(x, z); }
/** The nearest walkable point to (x, z): rings of candidates out to 20 ft, so a bad spawn never leaves someone inside a wall. */
export function freePoint(x: number, z: number): { x: number; z: number } {
  if (!blocked(x, z)) return { x, z };
  for (let r = 1; r <= 20; r += 1) {
    const n = Math.max(8, Math.round(r * 4));
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (!blocked(px, pz)) return { x: px, z: pz }; }
  }
  return { x, z };
}

/* ---------- the figure ---------- */
/** An avatar: the rigged GLB from public/models when present (idle/walk/run, recolored by material name), else primitives. */
export function AvatarModel({ config, motion, idle }: { config: AvatarConfig; motion?: Motion; idle?: boolean }) {
  const url = useModelUrl(`avatar-${config.body}`);
  const still = useMemo<Motion>(() => ({ speed: 0 }), []);
  const m = idle || !motion ? still : motion;
  if (url) return <Suspense fallback={<PrimitiveAvatar config={config} motion={m} />}><AvatarRig config={config} motion={m} url={url} /></Suspense>;
  return <PrimitiveAvatar config={config} motion={m} />;
}

/* ---------- fallback figure ---------- */
/** One procedural figure per body type, built once and cloned per instance (geometry and textures are shared). */
const templates: Partial<Record<AvatarConfig["body"], { scene: THREE.Group; clips: THREE.AnimationClip[] }>> = {};
function avatarTemplate(body: AvatarConfig["body"]) {
  let t = templates[body];
  if (!t) { t = { scene: buildAvatar(body), clips: buildAvatarClips() }; templates[body] = t; }
  return t;
}

/**
 * Fallback figure: the same procedural avatar the GLB is exported from, shown
 * while the model loads or when the manifest is missing. Recoloured by material
 * name, hair picked by node name, idle/walk/run crossfaded from the shared motion state.
 */
function PrimitiveAvatar({ config, motion }: { config: AvatarConfig; motion: Motion }) {
  const { body, skin, hairColor, shirt, pants, hair, costume } = config;
  const obj = useMemo(() => {
    const t = avatarTemplate(body);
    const c = t.scene.clone(true);
    const colors = applyAvatarLook(c, { body, skin, hair, hairColor, shirt, pants, costume });
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const name = (m.material as THREE.Material).name;
      if ((RECOLOR_MATERIALS as readonly string[]).includes(name)) { const mm = (m.material as THREE.MeshStandardMaterial).clone(); mm.color.set(colors[name]); if (name === "costume2") mm.emissive.set(colors[name]).multiplyScalar(0.25); m.material = mm; }
    });
    return c;
  }, [body, skin, hairColor, shirt, pants, hair, costume]);
  const mixer = useMemo(() => new THREE.AnimationMixer(obj), [obj]);
  const actions = useMemo(() => Object.fromEntries(avatarTemplate(body).clips.map((c) => [c.name, mixer.clipAction(c)])) as Record<string, THREE.AnimationAction>, [body, mixer]);
  const current = useRef("");
  const emoteState = useRef({ at: 0, until: 0, name: "" });
  const ref = useRef<THREE.Object3D>(null);
  useEffect(() => () => { mixer.stopAllAction(); }, [mixer]);
  useFrame(({ camera }, dt) => {
    const o = ref.current; if (!o) return;
    if (!o.visible || (o.parent && !o.parent.visible)) return;
    const p = o.parent ?? o;
    if (Math.hypot(camera.position.x - p.position.x, camera.position.z - p.position.z) > 220) return;
    const want = wantedClip(motion, actions, emoteState.current);
    if (want !== current.current) {
      const next = actions[want], prev = actions[current.current];
      if (next) { next.reset().setLoop(ONESHOT.has(want) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity).setEffectiveWeight(1).fadeIn(0.18).play(); next.clampWhenFinished = ONESHOT.has(want); if (prev) prev.fadeOut(0.18); current.current = want; }
    }
    mixer.update(dt);
  });
  return <primitive ref={ref} object={obj} />;
}

/* ---------- the player: walk mode controls + third-person camera ---------- */
const WALK = 9, RUN = 17;
export function Player() {
  const mode = useHall((s) => s.mode);
  const avatar = useHall((s) => s.avatar);
  const walkTarget = useHall((s) => s.walkTarget);
  const setWalkTarget = useHall((s) => s.setWalkTarget);
  const select = useHall((s) => s.select);
  const booths = useHall((s) => s.booths);
  const { camera, gl } = useThree();
  const group = useRef<THREE.Group>(null);
  const pos = useRef(new THREE.Vector3(X0 + 17 * PITCH + SLOT + AISLE_W / 2, 0, Z0 + 28)); // centre of aisle 1800, by the middle entrance
  const heading = useRef(0); // dx = sin(h), dz = cos(h): heading 0 faces +z, into the hall
  const yaw = useRef(0);
  const pitch = useRef(0); // mouse tilt, radians; + looks up

  // mouse look: drag anywhere on the hall to turn the view (a short click still opens banners)
  useEffect(() => {
    if (mode !== "walk") return;
    const el = gl.domElement;
    let down = false, lx = 0, ly = 0, pid = -1; // one pointer looks; on a phone the other thumb is on the joystick
    const onDown = (e: PointerEvent) => { if (down || (e.button !== 0 && e.button !== 2)) return; down = true; pid = e.pointerId; lx = e.clientX; ly = e.clientY; };
    const onMove = (e: PointerEvent) => {
      if (!down || e.pointerId !== pid) return;
      const pr = getPrefs();
      input.yawDrag -= (e.clientX - lx) * 0.0045 * pr.sensitivity; input.pitchDrag -= (e.clientY - ly) * 0.003 * pr.sensitivity * (pr.invertY ? -1 : 1);
      lx = e.clientX; ly = e.clientY;
    };
    const onUp = (e: PointerEvent) => { if (e.pointerId !== pid) return; down = false; pid = -1; };
    const onBlur = () => { down = false; pid = -1; };
    const onCtx = (e: Event) => e.preventDefault();
    el.addEventListener("pointerdown", onDown); window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp); window.addEventListener("pointercancel", onUp); window.addEventListener("blur", onBlur); el.addEventListener("contextmenu", onCtx);
    el.style.cursor = "grab";
    return () => { el.removeEventListener("pointerdown", onDown); window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onUp); window.removeEventListener("blur", onBlur); el.removeEventListener("contextmenu", onCtx); el.style.cursor = ""; };
  }, [mode, gl]);
  const motion = playerMotion;
  const near = useRef<number | null>(null);
  const lastNear = useRef(0);
  const [firstPerson, setFirstPerson] = useState(false);
  const fp = useRef(false);
  const me = useHall((s) => s.me);
  const lastReport = useRef(0);
  // sitting: the figure snaps onto the seat facing the way the chair faces; any movement input stands it up again
  const seat = useRef<Seat | null>(null);
  const mayUse = (s: Seat) => s.booth == null || useHall.getState().myBooths.some((b) => b.id === s.booth);
  const sitDown = (s: Seat) => {
    if (!mayUse(s)) { useHall.getState().setToast(useHall.getState().me ? "That chair is for the exhibitor and their crew. Ask them to add you to their team (🎟️ Teams)." : "That chair is for the exhibitor's crew. Sign in if you're on it; theater benches are open to everyone."); return; }
    seat.current = s; motion.sit = true; motion.speed = 0; motion.emote = null;
    pos.current.set(s.x, 0, s.z); heading.current = s.yaw;
    // the view: behind you on a bench (watching the screen); from the aisle at your table, since the roll-up and tower are right behind the chair
    yaw.current = s.booth != null ? s.yaw + Math.PI : s.yaw;
    player.seated = true; useHall.getState().setSeated(s); social.pending.dirty = true;
  };
  const standUp = () => {
    const s = seat.current; if (!s) return;
    seat.current = null; motion.sit = false; player.seated = false; useHall.getState().setSeated(null);
    const fp = freePoint(s.x + Math.sin(s.yaw) * 1.6, s.z + Math.cos(s.yaw) * 1.6);
    pos.current.set(fp.x, 0, fp.z); social.pending.dirty = true;
  };
  const toggleSit = () => {
    if (seat.current) { standUp(); return; }
    const s = nearestSeat(pos.current.x, pos.current.z, mayUse) ?? nearestSeat(pos.current.x, pos.current.z);
    if (s) sitDown(s); else useHall.getState().setToast("Walk up to your chair or a theater bench to sit.");
  };
  const report = (leave = false, away = false) => {
    const pend = social.pending;
    const fresh = (t: number) => Date.now() - t < 6000;
    const body = leave ? { leave: true } : { x: pos.current.x, z: pos.current.z, h: heading.current, s: seat.current ? 3 : motion.speed, n: me?.displayName || "Visitor", a: avatar, e: pend.e && fresh(pend.e.t) ? pend.e : null, r: pend.r && fresh(pend.r.t) ? pend.r : null, w: away || document.hidden || undefined };
    pend.dirty = false;
    void fetch("/api/presence", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" }, keepalive: true })
      .then((r) => r.ok ? r.json() : null).then((j) => { if (j?.id && j.id !== live.me) { live.me = j.id; live.version++; } }).catch(() => {});
  };
  // tell the floor when we leave walk mode or the page; while the tab is in the background (no frames run) a slow
  // heartbeat keeps our spot as "away" instead of letting it time out
  useEffect(() => {
    if (mode !== "walk") return;
    const bye = () => report(true);
    window.addEventListener("pagehide", bye);
    const beat = setInterval(() => { if (document.hidden) report(false, true); }, 3000);
    const back = () => { if (!document.hidden) report(false, false); };
    document.addEventListener("visibilitychange", back);
    return () => { window.removeEventListener("pagehide", bye); document.removeEventListener("visibilitychange", back); clearInterval(beat); bye(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // teleport beside a person (People panel → "walk over")
  const walkPoint = useHall((s) => s.walkPoint);
  const setWalkPoint = useHall((s) => s.setWalkPoint);
  useEffect(() => {
    if (!walkPoint) return;
    const fp = freePoint(walkPoint.x, walkPoint.z);
    if (seat.current) { seat.current = null; motion.sit = false; player.seated = false; useHall.getState().setSeated(null); }
    pos.current.set(fp.x, 0, fp.z);
    if (walkPoint.face) { heading.current = Math.atan2(walkPoint.face.x - fp.x, walkPoint.face.z - fp.z); yaw.current = heading.current; }
    setWalkPoint(null);
  }, [walkPoint, setWalkPoint]);
  useEffect(() => {
    if (walkTarget == null) return;
    const sp = freePoint(standPoint(walkTarget).x, standPoint(walkTarget).z);
    const b = boothSpace(walkTarget);
    if (seat.current) { seat.current = null; motion.sit = false; player.seated = false; useHall.getState().setSeated(null); }
    pos.current.set(sp.x, 0, sp.z);
    if (b) heading.current = Math.atan2(b.x - sp.x, b.z - sp.z);
    yaw.current = heading.current;
    setWalkTarget(null);
  }, [walkTarget, setWalkTarget]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode !== "walk") return;
      const t = e.target as HTMLElement; if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA") return;
      if (e.key === "e" || e.key === "E" || e.key === "Enter") { if (near.current) select(near.current); else if (useHall.getState().nearBot) useHall.getState().setPanel("conbot"); }
      if (e.key === "v" || e.key === "V") { fp.current = !fp.current; setFirstPerson(fp.current); }
      if (e.key === "c" || e.key === "C") toggleSit();
      const n = Number(e.key); if (n >= 1 && n <= EMOTES.length) { const em = EMOTES[n - 1]; social.pending.e = { n: em.id, t: Date.now() }; social.pending.dirty = true; bumpSocial(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, select]);

  useFrame((state, dt) => {
    if (mode !== "walk" || !group.current) return;
    const d = Math.min(dt, 0.05);
    if (!document.hasFocus()) keys.clear();
    let fx = 0, fz = 0;
    // arrows: up/down walk, left/right turn. WASD: W/S walk, A/D strafe. Q/E also turn.
    if (isDown("w") || isDown("arrowup")) fz += 1;
    if (isDown("s") || isDown("arrowdown")) fz = fz > 0 ? 0 : -1; // S while walking forward stops you; alone it backs up
    if (isDown("a")) fx -= 1;
    if (isDown("d")) fx += 1;
    const joy = Math.hypot(input.joy.x, input.joy.y) > 0.05;
    fx += input.joy.x; fz -= input.joy.y;
    if (isDown("arrowleft") || isDown("q")) yaw.current += 2.2 * d;
    if (isDown("arrowright")) yaw.current -= 2.2 * d;
    yaw.current += input.yawDrag; input.yawDrag = 0;
    pitch.current = THREE.MathUtils.clamp(pitch.current + input.pitchDrag, -0.45, 0.6); input.pitchDrag = 0;
    const run = isDown("shift") || input.run;
    let len = Math.hypot(fx, fz);
    // a sit request from the HUD button or a click on a seat
    const rq = seating.request;
    if (rq) { seating.request = null; if (rq.seat === "stand") standUp(); else if (Math.hypot(rq.seat.x - pos.current.x, rq.seat.z - pos.current.z) < 14) { if (seat.current) standUp(); sitDown(rq.seat); } else useHall.getState().setToast("Walk closer to sit there."); }
    if (seat.current) { if (len > 0.3) standUp(); else len = 0; }
    if (len <= 0.01) motion.speed = 0;
    if (len > 0.01) {
      const nx = fx / Math.max(1, len), nz = fz / Math.max(1, len);
      // camera-relative: forward is the direction the camera looks (yaw)
      const sin = Math.sin(yaw.current), cos = Math.cos(yaw.current);
      // right of a figure facing (sin, cos) is (-cos, sin)
      const dx = -nx * cos + nz * sin, dz = nx * sin + nz * cos;
      const sp = (run ? RUN : WALK) * d;
      const nxp = pos.current.x + dx * sp, nzp = pos.current.z + dz * sp;
      if (blocked(pos.current.x, pos.current.z)) { const fp = freePoint(pos.current.x, pos.current.z); pos.current.x = fp.x; pos.current.z = fp.z; } // stuck inside something: step out
      if (!blocked(nxp, pos.current.z)) pos.current.x = nxp;
      if (!blocked(pos.current.x, nzp)) pos.current.z = nzp;
      heading.current = Math.atan2(dx, dz);
      motion.speed = run ? 2 : 1;
      // on the touch joystick the view eases toward the heading; with keys and mouse the view is yours
      if (joy) { let diff = heading.current - yaw.current; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); yaw.current += diff * Math.min(1, d * 1.5); }
    }
    group.current.position.copy(pos.current);
    group.current.rotation.y = heading.current;
    player.x = pos.current.x; player.z = pos.current.z; player.h = heading.current;
    if (!seat.current && social.pending.e && (!motion.emote || motion.emote.at !== social.pending.e.t)) motion.emote = { name: social.pending.e.n, at: social.pending.e.t };
    // share where we are: 6×/s while moving, once a second standing still, at once when an emote or reaction fired
    if (social.pending.dirty || state.clock.elapsedTime - lastReport.current > (motion.speed > 0 ? 0.16 : 1)) { lastReport.current = state.clock.elapsedTime; report(); }
    // camera
    const back = fp.current ? 0 : 20, up = fp.current ? 5.6 : 10;
    // keep the camera inside the building so it never ends up looking at the back of a wall
    const cx = THREE.MathUtils.clamp(pos.current.x - Math.sin(yaw.current) * back, X0 + 3, X0 + HALL_LENGTH - 3);
    const cz = THREE.MathUtils.clamp(pos.current.z - Math.cos(yaw.current) * back, Z0 + 3, Z0 + HALL_DEPTH - 3);
    camera.position.lerp(new THREE.Vector3(cx, up, cz), Math.min(1, d * 6));
    camera.lookAt(pos.current.x + Math.sin(yaw.current) * 20, 4.5 + Math.tan(pitch.current) * 20 + (fp.current ? 1.1 : 0), pos.current.z + Math.cos(yaw.current) * 20);
    // nearest claimed booth in front of us (and whether ConBot is in reach), every 0.25s
    if (state.clock.elapsedTime - lastNear.current > 0.25) {
      lastNear.current = state.clock.elapsedTime;
      const nb = Math.hypot(conbot.x - pos.current.x, conbot.z - pos.current.z) < 14;
      if (nb !== useHall.getState().nearBot) useHall.getState().setNearBot(nb);
      let best: number | null = null, bd = 22;
      for (const b of booths.values()) {
        const s = boothSpace(b.id); if (!s) continue;
        const dist = Math.hypot(s.x - pos.current.x, s.z - pos.current.z);
        if (dist < bd) { bd = dist; best = b.id; }
      }
      if (best !== near.current) { near.current = best; useHall.getState().setNear(best); }
      const ns = seat.current ? null : (nearestSeat(pos.current.x, pos.current.z, mayUse) ?? nearestSeat(pos.current.x, pos.current.z));
      const ok = !!ns && mayUse(ns);
      const st = useHall.getState();
      if ((ns?.id ?? null) !== (st.nearSeat?.id ?? null) || ok !== st.nearSeatOk) st.setNearSeat(ns, ok);
    }
  });

  if (mode !== "walk") return null;
  return (
    <group ref={group}>
      {!firstPerson && <AvatarModel config={avatar} motion={motion} />}
      {!firstPerson && <OverheadNotes id="me" />}
      <pointLight position={[0, 7, 0]} intensity={6} distance={14} color="#ffffff" />
    </group>
  );
}

/* ---------- NPC crowd wandering the aisles ---------- */
interface Npc { config: AvatarConfig; kind: "aisle" | "cross" | "plaza"; x: number; z: number; vx: number; vz: number; speed: number; pauseUntil: number; nextPause: number; tx: number; tz: number; heading: number }
function rnd(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }
const CROSS_Z0 = Z_CROSS0 + 3, CROSS_Z1 = Z_CROSS1 - 3;
/** A random walkable point in the arcade plaza (off the cabinet rows). */
function plazaPoint(r: () => number): [number, number] {
  for (let i = 0; i < 12; i++) {
    const x = ARCADE.x + (r() - 0.5) * (ARCADE.w - 10), z = ARCADE.z + (r() - 0.5) * (ARCADE.d - 10);
    if (!isBlocked(x, z)) return [x, z];
  }
  return [ARCADE.x, ARCADE.z];
}
/**
 * Ambient crowd. Three kinds of walker: aisle shoppers shuttling along one
 * corridor, cross-aisle traffic flowing the length of the hall, and plaza
 * wanderers drifting between spots in the arcade. Cosplayers cluster where a
 * real show's do: the plaza and the headliner aisles.
 */
export function Crowd({ count = 110 }: { count?: number }) {
  const npcs = useMemo<Npc[]>(() => {
    const r = rnd(42);
    const corridors = hallLayout().filter((b) => b.facing === 1).map((b) => b.x + b.w / 2 + 5);
    const unique = Array.from(new Set(corridors.map((x) => Math.round(x))));
    return Array.from({ length: count }, (): Npc => {
      const roll = r();
      const kind: Npc["kind"] = roll < 0.18 ? "plaza" : roll < 0.32 ? "cross" : "aisle";
      const corridor = unique[Math.floor(r() * unique.length)];
      const costumeOdds = kind === "plaza" ? 0.5 : kind === "cross" ? 0.3 : Math.abs(corridor) < 130 ? 0.3 : 0.15;
      const config: AvatarConfig = { ...DEFAULT_AVATAR, body: r() < 0.5 ? "a" : "b", skin: SKIN_TONES[Math.floor(r() * SKIN_TONES.length)], hair: (["short", "long", "buzz", "bun", "curly", "bald"] as const)[Math.floor(r() * 6)], hairColor: HAIR_COLORS[Math.floor(r() * 9)], shirt: OUTFIT_COLORS[Math.floor(r() * OUTFIT_COLORS.length)], pants: OUTFIT_COLORS[Math.floor(r() * OUTFIT_COLORS.length)], costume: r() < costumeOdds ? CROWD_COSTUMES[Math.floor(r() * CROWD_COSTUMES.length)] : "none" };
      const speed = 3.5 + r() * 5;
      const base = { config, speed, pauseUntil: 0, nextPause: 4 + r() * 20, heading: 0 };
      if (kind === "plaza") { const [x, z] = plazaPoint(r); const [tx, tz] = plazaPoint(r); return { ...base, kind, x, z, tx, tz, vx: 0, vz: 0 }; }
      if (kind === "cross") { const dir = r() < 0.5 ? 1 : -1; return { ...base, kind, x: X0 + 20 + r() * (HALL_LENGTH - 40), z: CROSS_Z0 + r() * (CROSS_Z1 - CROSS_Z0), vx: dir, vz: 0, tx: 0, tz: 0 }; }
      return { ...base, kind, x: corridor + (r() - 0.5) * 4, z: Z_FRONT + r() * (Z_BACK - Z_FRONT), vx: 0, vz: r() < 0.5 ? 1 : -1, tx: 0, tz: 0 };
    }).map((n) => { const fp = freePoint(n.x, n.z); return { ...n, x: fp.x, z: fp.z }; }); // never start inside a cabinet row, the stage or a booth
  }, [count]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const motions = useMemo<Motion[]>(() => npcs.map(() => ({ speed: 1 })), [npcs]);
  useEffect(() => { perf.npcs = npcs.length; }, [npcs]);
  useFrame(({ camera, clock }, dt) => {
    const d = Math.min(dt, 0.05);
    const t = clock.elapsedTime;
    npcs.forEach((n, i) => {
      let moving = false;
      // stop to look at something now and then, then move on
      if (t < n.pauseUntil) motions[i].speed = 0;
      else if (t > n.nextPause) { n.pauseUntil = t + 2 + Math.random() * 5; n.nextPause = n.pauseUntil + 6 + Math.random() * 25; motions[i].speed = 0; }
      else { motions[i].speed = n.speed > 7.5 ? 2 : 1; moving = true; }
      if (moving) {
        if (n.kind === "aisle") {
          const nz = n.z + n.vz * n.speed * d;
          // corridors run straight through the plaza: turn back at a cabinet row, the stage or the pad
          if (isBlocked(n.x, nz)) n.vz *= -1; else n.z = nz;
          if (n.z > Z_BACK + 6 || n.z < Z_FRONT - 6) n.vz *= -1;
        } else if (n.kind === "cross") {
          n.x += n.vx * n.speed * d;
          if (n.x > X0 + HALL_LENGTH - 12 || n.x < X0 + 12) n.vx *= -1;
          // step round the arcade plaza instead of walking through the cabinets
          if (isBlocked(n.x, n.z)) { n.x -= n.vx * n.speed * d; n.vx *= -1; }
        } else {
          const dx = n.tx - n.x, dz = n.tz - n.z, dist = Math.hypot(dx, dz);
          if (dist < 1.5) { const [tx, tz] = plazaPoint(Math.random); n.tx = tx; n.tz = tz; n.pauseUntil = t + 1 + Math.random() * 4; }
          else {
            const step = Math.min(dist, n.speed * 0.8 * d);
            const nx = n.x + (dx / dist) * step, nz = n.z + (dz / dist) * step;
            if (isBlocked(nx, nz)) { const [tx, tz] = plazaPoint(Math.random); n.tx = tx; n.tz = tz; }
            else { n.vx = dx / dist; n.vz = dz / dist; n.x = nx; n.z = nz; }
          }
        }
      }
      const g = refs.current[i];
      if (g) {
        // face the way we're going, easing round corners
        const want = Math.atan2(n.vx, n.vz);
        let diff = want - n.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        n.heading += diff * Math.min(1, d * 6);
        g.position.set(n.x, 0, n.z); g.rotation.y = n.heading;
        // only draw people near the camera; the rest keep walking unseen
        g.visible = Math.hypot(camera.position.x - n.x, camera.position.z - n.z) < 170;
      }
    });
  });
  return <>{npcs.map((n, i) => <group key={i} ref={(el) => { refs.current[i] = el; }}><AvatarModel config={n.config} motion={motions[i]} /></group>)}</>;
}

/* ---------- other live visitors, shared session ---------- */
/** Everyone else walking the floor right now; positions arrive via /api/live and are eased between updates. */
export function Others() {
  const [ids, setIds] = useState<string[]>([]);
  const seen = useRef(-1);
  useFrame(() => {
    if (live.version !== seen.current) {
      seen.current = live.version;
      const list = Array.from(live.players.keys()).filter((id) => id !== live.me);
      setIds(list);
      const st = useHall.getState();
      st.setStats({ walking: list.length + (st.mode === "walk" ? 1 : 0) });
    }
  });
  return <>{ids.map((id) => <Other key={id} id={id} />)}</>;
}

/** Open a private chat with someone on the floor. */
export function openDm(id: string, name: string) {
  social.dm.active = { id, name };
  social.dm.messages = [];
  const th = social.dm.threads.find((t) => t.with === id); if (th) { th.unread = 0; social.dm.unread = social.dm.threads.reduce((a, t) => a + t.unread, 0); }
  bumpSocial();
  useHall.getState().setPanel("dm");
}
/** Speech bubble (chat or private message) and a floating reaction over a figure's head. */
function OverheadNotes({ id }: { id: string }) {
  const s = useSocial();
  const [, tick] = useState(0);
  const b = s.bubbles.get(id), r = s.reactions.get(id);
  const now = Date.now();
  const liveB = b && b.until > now ? b : null, liveR = r && r.until > now ? r : null;
  useEffect(() => { if (!liveB && !liveR) return; const t = setTimeout(() => tick((n) => n + 1), Math.max(50, Math.min(liveB ? liveB.until - now : Infinity, liveR ? liveR.until - now : Infinity) + 20)); return () => clearTimeout(t); }, [liveB, liveR, now]);
  if (!liveB && !liveR) return null;
  return (
    <Html position={[0, 9.4, 0]} center zIndexRange={[45, 0]} style={{ pointerEvents: "none" }}>
      <div className="flex flex-col items-center gap-1">
        {liveR && <div className="text-3xl drop-shadow" style={{ animation: "fcc-float 3s ease-out forwards" }}>{liveR.k}</div>}
        {liveB && <div className="max-w-[220px] rounded-2xl border border-white/15 bg-white px-3 py-1.5 text-center text-[12px] font-medium text-slate-900 shadow-lg">{liveB.text}</div>}
      </div>
    </Html>
  );
}
const MARKER_MAT = new THREE.MeshBasicMaterial({ color: "#5ee6c3", toneMapped: false });
const MARKER_GEO = new THREE.ConeGeometry(0.55, 1.1, 3);
/** The "real person" marker: a glowing triangle that floats, bobs and turns above a live visitor so nobody mistakes them for the crowd. */
const AWAY_MAT = new THREE.MeshBasicMaterial({ color: "#64748b" });
function LiveMarker({ away }: { away?: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => { const m = ref.current; if (!m) return; m.position.y = 8.9 + (away ? 0 : Math.sin(clock.elapsedTime * 2.4) * 0.25); m.rotation.y = away ? 0 : clock.elapsedTime * 1.6; });
  return <mesh ref={ref} geometry={MARKER_GEO} material={away ? AWAY_MAT : MARKER_MAT} rotation={[Math.PI, 0, 0]} position={[0, 8.9, 0]} />;
}
function Other({ id }: { id: string }) {
  const group = useRef<THREE.Group>(null);
  const motion = useRef<Motion>({ speed: 0 }).current;
  const [cfg, setCfg] = useState<AvatarConfig>(() => live.players.get(id)?.a ?? DEFAULT_AVATAR);
  const [name, setName] = useState(() => live.players.get(id)?.n ?? "Visitor");
  const [title, setTitle] = useState<string | null>(() => live.players.get(id)?.j ?? null);
  const [away, setAway] = useState<boolean>(() => !!live.players.get(id)?.w);
  const cur = useRef<{ x: number; z: number; h: number } | null>(null);
  const [near, setNear] = useState(false);
  const nearT = useRef(0);
  useFrame(({ camera, clock }, dt) => {
    const p: LivePlayer | undefined = live.players.get(id);
    const g = group.current; if (!p || !g) return;
    if (!cur.current) cur.current = { x: p.x, z: p.z, h: p.h };
    const c = cur.current;
    const k = Math.min(1, dt * 8);
    c.x += (p.x - c.x) * k; c.z += (p.z - c.z) * k;
    let dh = p.h - c.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); c.h += dh * k;
    g.position.set(c.x, 0, c.z); g.rotation.y = c.h;
    motion.speed = p.s === 3 ? 0 : p.s; motion.sit = p.s === 3;
    if (p.e && Date.now() - p.e.t < 6000 && (!motion.emote || motion.emote.at !== p.e.t)) motion.emote = { name: p.e.n, at: p.e.t };
    if (p.r && Date.now() - p.r.t < 4000) { const cur = social.reactions.get(id); if (!cur || cur.until - 3000 < p.r.t) { social.reactions.set(id, { k: p.r.k, until: p.r.t + 3000 }); bumpSocial(); } }
    if (p.a && p.a !== cfg && JSON.stringify(p.a) !== JSON.stringify(cfg)) setCfg(p.a);
    if (p.n !== name) setName(p.n);
    if ((p.j ?? null) !== title) setTitle(p.j ?? null);
    if (!!p.w !== away) setAway(!!p.w);
    if (clock.elapsedTime - nearT.current > 0.5) { nearT.current = clock.elapsedTime; const d = Math.hypot(camera.position.x - c.x, camera.position.z - c.z); g.visible = d < 260; const n = d < 80; if (n !== near) setNear(n); }
  });
  return (
    <group ref={group} onClick={(e) => { e.stopPropagation(); openDm(id, name); }} onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
      <AvatarModel config={cfg} motion={motion} />
      <LiveMarker away={away} />
      <OverheadNotes id={id} />
      {near && (
        <Html position={[0, 7.6, 0]} center zIndexRange={[40, 0]} style={{ pointerEvents: "none" }}>
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-slate-950/80 px-2 py-0.5 text-[11px] font-semibold text-white whitespace-nowrap"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_6px_#5ee6c3]" /><span className="flex flex-col leading-tight"><span>{name}</span>{title && <span className="text-[9px] font-normal text-slate-300">{title}</span>}</span><span className={`text-[9px] font-bold uppercase tracking-wider ${away ? "text-slate-400" : "text-emerald-300"}`}>{away ? "away" : "live"}</span></div>
        </Html>
      )}
    </group>
  );
}
