"use client";
/**
 * The far crowd. A figure more than ~100 ft from the camera is not worth a skinned rig with its own animation mixer
 * (7+ draw calls and a few thousand skinned vertices each), so AvatarModel unmounts the rig and registers the figure
 * here instead. Every registered figure of one body type is drawn by a single instanced mesh of the body's idle pose
 * ("lod", baked into the avatar GLB by lib/hall/modelkit/assemble.ts), tinted per instance: the _part attribute on
 * each vertex says whether it is skin, shirt, pants, hair, shoes or trim, and four per-instance colours do the rest.
 * Two hundred far figures are two draw calls.
 */
import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useModel, useModelUrl, ModelBoundary } from "./models";
import type { AvatarConfig } from "@/lib/hall/store";

export interface ImpostorSlot { body: AvatarConfig["body"]; x: number; z: number; h: number; skin: string; shirt: string; pants: string; hair: string; hasHair: boolean; visible: boolean }
/** Figures currently far enough to be drawn as instances, keyed by the AvatarModel that owns them. */
export const impostors = new Map<string, ImpostorSlot>();
/** Rig beyond this distance (ft) becomes an instance; back to a rig inside NEAR_FT. The gap stops flicker at the line. */
export const LOD_FAR_FT = 105, LOD_NEAR_FT = 90;

const CAP = 512;
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();

function tintMaterial(): THREE.Material {
  const mat = new THREE.MeshLambertMaterial({ color: "#ffffff" });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float _part; attribute vec3 iSkin; attribute vec3 iShirt; attribute vec3 iPants; attribute vec3 iHair; attribute float iFlags; varying vec3 vTint;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nint part = int(floor(_part * 8.0 + 0.5));\nvTint = part == 0 ? iSkin : part == 1 ? iShirt : part == 2 ? iPants : part == 3 ? iHair : part == 4 ? vec3(0.02) : vec3(0.03);\nif (part == 3 && iFlags < 0.5) transformed = vec3(0.0);"); // bald or hooded: the hair collapses to a point
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTint;")
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( diffuse * vTint, opacity );");
  };
  return mat;
}

function Instances({ body }: { body: AvatarConfig["body"] }) {
  const url = useModelUrl(`avatar-${body}`)!;
  const { scene } = useModel(url);
  const mesh = useMemo(() => {
    const lod = scene.getObjectByName("lod") as THREE.Mesh | undefined;
    if (!lod?.geometry.getAttribute("_part")) return null;
    const g = lod.geometry.clone();
    for (const name of ["iSkin", "iShirt", "iPants", "iHair"]) g.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3));
    g.setAttribute("iFlags", new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1));
    const im = new THREE.InstancedMesh(g, tintMaterial(), CAP);
    im.count = 0; im.frustumCulled = false; im.name = `impostors-${body}`;
    return im;
  }, [scene, body]);
  useEffect(() => () => { mesh?.geometry.dispose(); (mesh?.material as THREE.Material | undefined)?.dispose(); }, [mesh]);
  useFrame(() => {
    if (!mesh) return;
    const g = mesh.geometry;
    const skin = g.getAttribute("iSkin") as THREE.InstancedBufferAttribute, shirt = g.getAttribute("iShirt") as THREE.InstancedBufferAttribute, pants = g.getAttribute("iPants") as THREE.InstancedBufferAttribute, hair = g.getAttribute("iHair") as THREE.InstancedBufferAttribute, flags = g.getAttribute("iFlags") as THREE.InstancedBufferAttribute;
    let n = 0;
    for (const s of impostors.values()) {
      if (s.body !== body || !s.visible || n >= CAP) continue;
      tmpM.compose(tmpP.set(s.x, 0, s.z), tmpQ.setFromAxisAngle(up, s.h), one);
      mesh.setMatrixAt(n, tmpM);
      col.set(s.skin); skin.setXYZ(n, col.r, col.g, col.b);
      col.set(s.shirt); shirt.setXYZ(n, col.r, col.g, col.b);
      col.set(s.pants); pants.setXYZ(n, col.r, col.g, col.b);
      col.set(s.hair); hair.setXYZ(n, col.r, col.g, col.b);
      flags.setX(n, s.hasHair ? 1 : 0);
      n++;
    }
    mesh.count = n;
    if (n) { mesh.instanceMatrix.needsUpdate = true; skin.needsUpdate = shirt.needsUpdate = pants.needsUpdate = hair.needsUpdate = flags.needsUpdate = true; }
  });
  return mesh ? <primitive object={mesh} /> : null;
}

/** Mount once in the scene. Draws whatever AvatarModel has handed over as far away. */
export function CrowdImpostors() {
  const a = useModelUrl("avatar-a"), b = useModelUrl("avatar-b");
  return (
    <ModelBoundary fallback={null}>
      <Suspense fallback={null}>
        {a && <Instances body="a" />}
        {b && <Instances body="b" />}
      </Suspense>
    </ModelBoundary>
  );
}
