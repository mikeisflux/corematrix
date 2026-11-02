"use client";
/**
 * The route of a guided tour on the floor: a flat amber ribbon from the walker to the current stop, its dashes
 * marching toward the stop, and a pulsing ring on the spot to stand. A ribbon rather than a GL line because lines
 * draw one pixel wide whatever the distance, and a bearing across a 1000 ft hall has to read from 20 ft up. It is
 * a straight line: the stops are in the aisles and ConBot walks ahead, so it points the way rather than paths it.
 * The route also tells the tour store where the walker is, which is how a stop counts as reached.
 */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { player } from "./Avatar";
import { useTours, currentStop, tickTour } from "@/lib/hall/tours";

const Y = 0.12; // a few inches over the carpet: under the figures' feet, over the floor decals
const WIDTH = 1.4, DASH = 3, GAP = 1.5;
// over 1 so the bloom pass picks it up: the ribbon and ring glow a little by day and a lot after hours
const GLOW = new THREE.Color(2.2, 1.7, 0.5);
// The carpets are pulled toward the camera with a polygon offset of their own (the plaza's is -2), and seen from a low
// walk camera a floor's depth slope is steep enough for that to beat a surface a few inches above it: the same -4 the
// mascot's shadow blob uses keeps the route on top.
const ON_TOP = { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 };

/** One dash and one gap, repeated along the ribbon; the gap is transparent so the carpet shows through. */
function dashTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas"); c.width = 8; c.height = 64;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 8, 64);
  g.fillStyle = "#fff"; g.fillRect(0, 0, 8, Math.round((64 * DASH) / (DASH + GAP)));
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  return tex;
}

export function TourRoute() {
  const t = useTours();
  const invalidate = useThree((s) => s.invalidate);
  // the ribbon is built by hand: a unit plane already lying flat, scaled along z to the distance each frame
  const ribbon = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2); // +y of the plane becomes -z, so v=0 is the far end
    const mat = new THREE.MeshBasicMaterial({ map: dashTexture(), color: GLOW, toneMapped: false, transparent: true, depthWrite: false, side: THREE.DoubleSide, ...ON_TOP });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false; // its length changes every frame; a stale bounding sphere would blink it out
    return m;
  }, []);
  useEffect(() => () => { ribbon.geometry.dispose(); ribbon.material.map?.dispose(); ribbon.material.dispose(); }, [ribbon]);
  // a capped hall renders on demand: make sure the first frame of a new stop is drawn right away
  useEffect(() => { invalidate(); }, [t.version, invalidate]);
  const rig = useRef<THREE.Group>(null);     // at the walker, turned to face the stop: the ribbon runs along its +z
  const strip = useRef<typeof ribbon>(null); // the mounted ribbon, moved every frame
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }, dt) => {
    const stop = currentStop();
    if (!stop) return;
    tickTour(player.x, player.z);
    const dx = stop.x - player.x, dz = stop.z - player.z, len = Math.hypot(dx, dz);
    // start a step ahead of the figure so the ribbon is not under its feet
    const lead = Math.min(2, len), span = Math.max(0.01, len - lead);
    if (rig.current) { rig.current.position.set(player.x, Y, player.z); rig.current.rotation.y = Math.atan2(dx, dz); }
    const rb = strip.current;
    if (rb) {
      rb.position.z = lead + span / 2;
      rb.scale.set(WIDTH, 1, span);
      const map = rb.material.map;
      if (map) {
        map.repeat.y = span / (DASH + GAP);
        // v runs from the stop end back to the walker, so a growing offset slides the dashes toward the stop
        map.offset.y += Math.min(dt, 0.1) * 1.6;
      }
    }
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 3);
    if (ring.current) { ring.current.position.set(stop.x, Y, stop.z); ring.current.scale.setScalar(1 + 0.3 * pulse); (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.9 - 0.5 * pulse; }
  });
  const stop = currentStop();
  if (!t.active || !stop) return null;
  return (
    <group>
      <group ref={rig} position={[player.x, Y, player.z]}>
        <primitive ref={strip} object={ribbon} />
      </group>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[stop.x, Y, stop.z]}>
        <ringGeometry args={[2.4, 3.1, 48]} />
        <meshBasicMaterial color={GLOW} toneMapped={false} transparent depthWrite={false} side={THREE.DoubleSide} {...ON_TOP} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[stop.x, Y - 0.02, stop.z]}>
        <circleGeometry args={[2.4, 48]} />
        <meshBasicMaterial color={GLOW} toneMapped={false} transparent opacity={0.18} depthWrite={false} side={THREE.DoubleSide} {...ON_TOP} />
      </mesh>
    </group>
  );
}
