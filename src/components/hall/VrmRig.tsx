"use client";
/**
 * A visitor wearing their own VRM model (VRoid Studio and friends). The file is loaded per figure (a VRM cannot be
 * cloned: its spring bones and look-at hold on to the loaded bones), scaled from metres to the hall's feet, turned to
 * face +z, and driven by the hall's own clips re-expressed for the VRM humanoid (lib/hall/vrm-clips.ts), so it walks,
 * runs, sits and emotes like everyone else. Until the file is in (or if it fails) the built-in figure stands in.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { useModel, useModelUrl, useFigureAnimation, type Motion } from "./models";
import { humanoidClips } from "@/lib/hall/vrm-clips";
import type { AvatarConfig } from "@/lib/hall/store";

const FT_PER_M = 1 / 0.3048;

function useVrm(url: string): { vrm: VRM | null; failed: boolean } {
  const [state, setState] = useState<{ vrm: VRM | null; failed: boolean }>({ vrm: null, failed: false });
  useEffect(() => {
    let live = true; let loaded: VRM | null = null;
    const loader = new GLTFLoader(); loader.register((p) => new VRMLoaderPlugin(p));
    loader.loadAsync(url).then((gltf) => {
      const vrm = gltf.userData.vrm as VRM | undefined;
      if (!vrm) throw new Error("no VRM data");
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      VRMUtils.rotateVRM0(vrm); // 0.x models face -z; everyone in the hall faces +z
      vrm.scene.scale.setScalar(FT_PER_M);
      vrm.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.frustumCulled = false; m.castShadow = true; } });
      if (!live) { VRMUtils.deepDispose(vrm.scene); return; }
      loaded = vrm; setState({ vrm, failed: false });
    }).catch((e) => { console.warn("[vrm] could not load", url, e); if (live) setState({ vrm: null, failed: true }); });
    return () => { live = false; if (loaded) VRMUtils.deepDispose(loaded.scene); };
  }, [url]);
  return state;
}

export function VrmRig({ url, config, motion, fallback }: { url: string; config: AvatarConfig; motion: Motion; fallback: ReactNode }) {
  const { vrm, failed } = useVrm(url);
  if (failed || !vrm) return <>{fallback}</>;
  return <VrmFigure vrm={vrm} config={config} motion={motion} />;
}

function VrmFigure({ vrm, config, motion }: { vrm: VRM; config: AvatarConfig; motion: Motion }) {
  const base = useModel(useModelUrl(`avatar-${config.body}`)!); // the hall's clips come from the built-in figure
  const mixer = useMemo(() => new THREE.AnimationMixer(vrm.scene), [vrm]);
  const actions = useMemo(() => {
    const { clips, hipsHeight } = humanoidClips(base.scene, base.animations);
    const hips = vrm.humanoid.getNormalizedBoneNode("hips");
    const hipsRest = hips ? hips.position.clone() : new THREE.Vector3();
    const scale = hips ? (hipsRest.y / hipsHeight) : 0; // our feet of hip travel → this model's metres
    const out: Record<string, THREE.AnimationAction> = {};
    for (const clip of clips) {
      const tracks: THREE.KeyframeTrack[] = [];
      for (const tr of clip.tracks) {
        const [bone, prop] = tr.name.split(".");
        const node = vrm.humanoid.getNormalizedBoneNode(bone as "hips"); if (!node) continue;
        if (prop === "position") { const v = Array.from(tr.values); for (let i = 0; i < v.length; i += 3) { v[i] = hipsRest.x + v[i] * scale; v[i + 1] = hipsRest.y + v[i + 1] * scale; v[i + 2] = hipsRest.z + v[i + 2] * scale; } tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.position`, Array.from(tr.times), v)); }
        else tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, Array.from(tr.times), Array.from(tr.values)));
      }
      out[clip.name] = mixer.clipAction(new THREE.AnimationClip(clip.name, clip.duration, tracks));
    }
    return out;
  }, [vrm, base, mixer]);
  const ref = useRef<THREE.Object3D>(null);
  useFigureAnimation(mixer, actions, motion, ref, (dt, camera) => { vrm.lookAt && (vrm.lookAt.target = camera); vrm.update(dt); });
  return <primitive ref={ref} object={vrm.scene} />;
}
