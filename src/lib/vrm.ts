/**
 * Visitors' own VRM avatars (VRoid Studio and friends). The file is checked (a real glTF binary carrying the VRM 0.x or
 * VRM 1.0 extension, within the size limit), its metadata (name, author, who may use it) is read out for the panel and
 * the admins, and the file is kept in R2 when storage is on or under data/vrm/ on the server otherwise. The floor
 * loads it through /api/f/vrm/<file>.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { r2Delete, r2Put, r2Ready } from "@/lib/r2";

export const VRM_MAX_BYTES = 15 * 1024 * 1024;
export const VRM_DIR = path.join(process.cwd(), "data", "vrm");
export { VRM_URL_RE } from "@/lib/vrm-url";
import { VRM_URL_RE } from "@/lib/vrm-url";

export interface VrmMeta { version: "0" | "1"; name: string; author: string; permission: string; license: string; bytes: number }

/** Reads the VRM metadata out of a glTF binary, or throws a message fit for the uploader. */
export function inspectVrm(buf: Uint8Array): VrmMeta {
  if (buf.byteLength > VRM_MAX_BYTES) throw new Error(`That file is ${(buf.byteLength / 1048576).toFixed(1)} MB; the limit is ${VRM_MAX_BYTES / 1048576} MB. Export a lighter model (fewer textures, smaller textures).`);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2) throw new Error("That is not a .vrm file (a glTF 2.0 binary).");
  const jsonLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a || 20 + jsonLen > buf.byteLength) throw new Error("That .vrm file is damaged (no JSON chunk).");
  let json: { extensionsUsed?: string[]; extensions?: Record<string, { meta?: Record<string, unknown> }> };
  try { json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLen))); } catch { throw new Error("That .vrm file is damaged (unreadable JSON)."); }
  const used = json.extensionsUsed ?? [];
  const str = (v: unknown, d = "") => (typeof v === "string" ? v.trim().slice(0, 120) : d);
  if (used.includes("VRMC_vrm") && json.extensions?.VRMC_vrm) {
    const m = json.extensions.VRMC_vrm.meta ?? {};
    const authors = Array.isArray(m.authors) ? (m.authors as unknown[]).map((a) => str(a)).filter(Boolean).join(", ") : "";
    return { version: "1", name: str(m.name, "Untitled"), author: authors.slice(0, 120), permission: str(m.avatarPermission, "onlyAuthor"), license: str(m.licenseUrl), bytes: buf.byteLength };
  }
  if (used.includes("VRM") && json.extensions?.VRM) {
    const m = json.extensions.VRM.meta ?? {};
    return { version: "0", name: str(m.title, "Untitled"), author: str(m.author), permission: str(m.allowedUserName, "OnlyAuthor"), license: str(m.licenseName) || str(m.otherLicenseUrl), bytes: buf.byteLength };
  }
  throw new Error("That file has no VRM data in it. Export it as .vrm (VRM 0.x or 1.0) from VRoid Studio, Blender's VRM add-on or UniVRM.");
}

/** Who the model's own metadata says may wear it, in plain words. */
export function permissionLabel(p: string): string {
  switch (p) {
    case "everyone": case "Everyone": return "anyone may use it";
    case "onlySeparatelyLicensedPerson": case "ExplicitlyLicensedPerson": return "licensed people only";
    default: return "the author only";
  }
}

const fileName = (userId: string) => `${userId.replace(/[^A-Za-z0-9_-]/g, "")}-${Date.now().toString(36)}.vrm`;

/** Stores the file and returns the URL the floor loads it from. */
export async function storeVrm(userId: string, buf: Uint8Array): Promise<string> {
  const name = fileName(userId);
  const cfg = await r2Ready();
  if (cfg) await r2Put(cfg, `vrm/${name}`, buf, "model/gltf-binary");
  else { await fs.mkdir(VRM_DIR, { recursive: true }); await fs.writeFile(path.join(VRM_DIR, name), buf); }
  return `/api/f/vrm/${name}`;
}

/** Removes a stored file (both places are tried; a missing file is fine). */
export async function removeVrm(url: string | null | undefined): Promise<void> {
  if (!url || !VRM_URL_RE.test(url)) return;
  const name = url.slice("/api/f/vrm/".length);
  const cfg = await r2Ready(); if (cfg) await r2Delete(cfg, `vrm/${name}`);
  await fs.unlink(path.join(VRM_DIR, name)).catch(() => {});
}

/** Reads a stored file back (for the proxy route when R2 has no public URL, or from disk). */
export async function readLocalVrm(name: string): Promise<Uint8Array | null> {
  if (!/^[A-Za-z0-9_-]+\.vrm$/.test(name)) return null;
  try { return new Uint8Array(await fs.readFile(path.join(VRM_DIR, name))); } catch { return null; }
}
