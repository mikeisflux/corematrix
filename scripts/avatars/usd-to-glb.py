#!/usr/bin/env python3
"""
Converts Quaternius characters from the OpenUSD (.usda) copies in the chibifire-stages/quaternius-stage repository into
one skinned glTF binary on a single shared skeleton. Every character in the "Ultimate Animated Character" pack is skinned
to the same 32-joint rig, so parts from different files (a body from one, hair from another) can share one skin.

    python3 -I scripts/avatars/usd-to-glb.py spec.json

Spec: {"out": "file.glb", "scale": 2.1, "parts": [{"file": "SK_CasualMale.usda", "node": "body",
       "subsets": {"Skin": "skin", "Shirt": "shirt", ...}}, ...]}
Each part becomes one mesh node skinned to the shared skeleton, with one primitive per listed subset, named after the
output material. Unlisted subsets are dropped (that is how a file's built-in hair is left out). The result is Y-up,
faces +z, soles on y = 0, scaled by `scale` (the rig is ~2.8 units to the top of the skull), 4 influences per vertex,
flat-shaded (face normals are kept, vertices are split where normals differ). Needs the usd-core and numpy packages.
"""
import json, struct, sys, os, re
import numpy as np
from pxr import Usd, UsdSkel, UsdGeom, UsdShade, Gf

# default colours; the hall recolours skin/hair/shirt/pants at runtime by material name
COLORS = {"skin": "#c68642", "hair": "#2b1b12", "brow": "#2b1b12", "shirt": "#e63946", "pants": "#1f2a44", "belt": "#2a1d14", "face": "#ffffff", "shoes": "#1b1b1f", "costume": "#b91c1c", "costume2": "#facc15", "prop": "#4b5563", "eye": "#15110f"}
ROUGH = {"hair": 0.55, "brow": 0.55, "shoes": 0.5, "face": 0.6, "eye": 0.35, "costume": 0.45}

def hex2rgb(h): return [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
def srgb2lin(c): return [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c]

def expand(p, base):
    """${VAR} in a path is an environment variable (QUATERNIUS_STAGE: the clone of chibifire-stages/quaternius-stage)."""
    p = re.sub(r"\$\{(\w+)\}", lambda m: os.environ.get(m.group(1), DEFAULT_ENV.get(m.group(1), m.group(0))), p)
    return p if os.path.isabs(p) else os.path.join(base, p)

# default: the repository cloned next to this one
DEFAULT_ENV = {"QUATERNIUS_STAGE": os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../chibifire-stages/quaternius-stage/models"))}

def load(path):
    stage = Usd.Stage.Open(path)
    skel = next(p for p in stage.Traverse() if p.IsA(UsdSkel.Skeleton))
    skelroot = next(p for p in stage.Traverse() if p.IsA(UsdSkel.Root))
    meshes = [p for p in stage.Traverse() if p.IsA(UsdGeom.Mesh)]
    xc = UsdGeom.XformCache()
    return stage, skel, skelroot, meshes, xc

def mat_np(m): return np.array([[m[i][j] for j in range(4)] for i in range(4)], dtype=np.float64)  # row-vector convention: p' = p @ M

TURN = np.eye(4)  # set per spec: a rotation about Y for files whose figure faces -z

def skeleton(skel, skelroot, xc, scale):
    sk = UsdSkel.Skeleton(skel)
    joints = list(sk.GetJointsAttr().Get())
    names = [j.split("/")[-1] for j in joints]
    topo = UsdSkel.Topology(joints)
    X = mat_np(xc.GetLocalToWorldTransform(skelroot)) @ TURN
    W = [mat_np(b) @ X for b in sk.GetBindTransformsAttr().Get()]
    for w in W: w[3, :3] *= scale  # uniform scale on positions only; the rotation part stays orthonormal
    parents = [topo.GetParent(i) for i in range(len(joints))]
    locals_ = []
    for i, w in enumerate(W):
        L = w @ np.linalg.inv(W[parents[i]]) if parents[i] >= 0 else w
        locals_.append(L)
    return names, parents, W, locals_, X

def quat_from_mat(L):
    """Rotation of a row-convention matrix as a glTF (x, y, z, w) quaternion."""
    R = L[:3, :3].T  # column convention
    t = np.trace(R)
    if t > 0:
        s = np.sqrt(t + 1) * 2; w = s / 4; x = (R[2, 1] - R[1, 2]) / s; y = (R[0, 2] - R[2, 0]) / s; z = (R[1, 0] - R[0, 1]) / s
    elif R[0, 0] > R[1, 1] and R[0, 0] > R[2, 2]:
        s = np.sqrt(1 + R[0, 0] - R[1, 1] - R[2, 2]) * 2; w = (R[2, 1] - R[1, 2]) / s; x = s / 4; y = (R[0, 1] + R[1, 0]) / s; z = (R[0, 2] + R[2, 0]) / s
    elif R[1, 1] > R[2, 2]:
        s = np.sqrt(1 + R[1, 1] - R[0, 0] - R[2, 2]) * 2; w = (R[0, 2] - R[2, 0]) / s; x = (R[0, 1] + R[1, 0]) / s; y = s / 4; z = (R[1, 2] + R[2, 1]) / s
    else:
        s = np.sqrt(1 + R[2, 2] - R[0, 0] - R[1, 1]) * 2; w = (R[1, 0] - R[0, 1]) / s; x = (R[0, 2] + R[2, 0]) / s; y = (R[1, 2] + R[2, 1]) / s; z = s / 4
    q = np.array([x, y, z, w]); return (q / np.linalg.norm(q)).tolist()

def mesh_part(prim, names, X, scale, subsets_wanted):
    """Returns {material: (positions, normals, joints, weights, indices)} for the wanted subsets of one USD mesh."""
    mesh = UsdGeom.Mesh(prim)
    pts = np.array(mesh.GetPointsAttr().Get(), dtype=np.float64)
    fvc = np.array(mesh.GetFaceVertexCountsAttr().Get()); fvi = np.array(mesh.GetFaceVertexIndicesAttr().Get())
    binding = UsdSkel.BindingAPI(prim)
    gbt = binding.GetGeomBindTransformAttr().Get()
    M = (mat_np(gbt) if gbt is not None else np.eye(4)) @ X
    P = np.c_[pts, np.ones(len(pts))] @ M
    P = P[:, :3] * scale
    R = M[:3, :3]
    nrm = mesh.GetNormalsAttr().Get()
    if nrm is not None and mesh.GetNormalsInterpolation() == "faceVarying":
        N = np.array(nrm, dtype=np.float64) @ R
    else:
        N = None
    # texture coordinates (primvars:st), per corner or per point
    UV = None; uv_pv = UsdGeom.PrimvarsAPI(prim).GetPrimvar("st")
    if uv_pv and uv_pv.Get() is not None:
        raw = np.array(uv_pv.ComputeFlattened(), dtype=np.float64); UV = (raw, uv_pv.GetInterpolation() == "faceVarying")  # flattened: indexed primvars expand to one value per corner
    # skin weights
    ji = binding.GetJointIndicesPrimvar(); jw = binding.GetJointWeightsPrimvar()
    es = ji.GetElementSize()
    idx = np.array(ji.Get()).reshape(-1, es); wts = np.array(jw.Get(), dtype=np.float64).reshape(-1, es)
    bound = binding.GetJointsAttr().Get()
    if bound:
        remap = np.array([names.index(j.split("/")[-1]) for j in bound]); idx = remap[idx]
    order = np.argsort(-wts, axis=1)[:, :4]
    idx4 = np.take_along_axis(idx, order, 1); w4 = np.take_along_axis(wts, order, 1)
    if idx4.shape[1] < 4:  # a piece bound to a single bone (hair, brows) still needs four slots
        pad = 4 - idx4.shape[1]; idx4 = np.pad(idx4, ((0, 0), (0, pad))); w4 = np.pad(w4, ((0, 0), (0, pad)))
    w4 = w4 / np.maximum(w4.sum(1, keepdims=True), 1e-9)
    # faces → subsets
    face_mat = np.full(len(fvc), -1)
    offsets = np.r_[0, np.cumsum(fvc)[:-1]]
    # face centroid heights, for the splits below
    cy = np.array([P[fvi[offsets[f]:offsets[f] + fvc[f]], 1].mean() for f in range(len(fvc))])
    wanted = []  # (subset, material) in output order; a subset may be split into several materials
    for sub, spec in subsets_wanted.items():
        if sub == "*":  # the whole mesh (files without subsets: a hair piece, a face)
            faces = np.arange(len(fvc))
        else:
            sp = prim.GetChild(sub)
            if not sp or not sp.IsA(UsdGeom.Subset): print(f"  warning: no subset {sub} in {prim.GetPath()}"); continue
            faces = np.array(UsdGeom.Subset(sp).GetIndicesAttr().Get())
        if isinstance(spec, dict) and "bands" in spec:  # {"bands": [[height, material], …, [null, material]]}: faces by centroid height, lowest band first
            lo = -1e9
            for top, matname in spec["bands"]:
                hi = 1e9 if top is None else float(top)
                if matname is not None: wanted.append((sub, matname)); face_mat[faces[(cy[faces] >= lo) & (cy[faces] < hi)]] = len(wanted) - 1  # a null material drops the band (a body hidden under clothes)
                lo = hi
        elif isinstance(spec, str):
            wanted.append((sub, spec)); face_mat[faces] = len(wanted) - 1
        elif "below" in spec:  # {"below": [height, materialBelow, materialAbove]}: the Quaternius legs end in bare stubs, the bottom becomes the shoes
            h, lo, hi = spec["below"]
            wanted.append((sub, lo)); face_mat[faces[cy[faces] < h]] = len(wanted) - 1
            wanted.append((sub, hi)); face_mat[faces[cy[faces] >= h]] = len(wanted) - 1
        elif "split_y" in spec:  # {"split_y": [lowerMaterial, upperMaterial]}: the "Face" subset is eyes (lower) and eyebrows (upper)
            lo, hi = spec["split_y"]; mid = (cy[faces].min() + cy[faces].max()) / 2
            wanted.append((sub, lo)); face_mat[faces[cy[faces] < mid]] = len(wanted) - 1
            wanted.append((sub, hi)); face_mat[faces[cy[faces] >= mid]] = len(wanted) - 1
    out = {}
    for k, (sub, matname) in enumerate(wanted):
        faces = np.nonzero(face_mat == k)[0]
        if len(faces) == 0: continue
        corners = []  # (corner index into fvi) triangles
        for f in faces:
            o, c = offsets[f], fvc[f]
            for t in range(1, c - 1): corners.extend([o, o + t, o + t + 1])
        corners = np.array(corners)
        vidx = fvi[corners]
        if N is not None: cn = N[corners]; cn = cn / np.maximum(np.linalg.norm(cn, axis=1, keepdims=True), 1e-9)
        else:
            # flat normals from the triangle itself
            tri = P[vidx].reshape(-1, 3, 3); fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]); fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-9); cn = np.repeat(fn, 3, axis=0)
        if UV is not None:
            raw, per_corner = UV; cuv = raw[corners] if per_corner else raw[vidx]
            cuv = np.c_[cuv[:, 0], 1 - cuv[:, 1]]  # glTF's v runs down
        else:
            cuv = np.zeros((len(vidx), 2))
        key = np.c_[vidx, np.round(cn, 3), np.round(cuv, 5)]
        uniq, inv = np.unique(key, axis=0, return_inverse=True)
        uv = uniq[:, 0].astype(int)
        out.setdefault(matname, []).append((P[uv].astype(np.float32), uniq[:, 1:4].astype(np.float32), idx4[uv].astype(np.uint16), w4[uv].astype(np.float32), inv.reshape(-1).astype(np.uint32), uniq[:, 4:6].astype(np.float32)))
    merged = {}
    for m, chunks in out.items():
        base = 0; ps, ns, js, ws, is_, ts = [], [], [], [], [], []
        for p, n, j, w, i, t in chunks: ps.append(p); ns.append(n); js.append(j); ws.append(w); is_.append(i + base); ts.append(t); base += len(p)
        merged[m] = (np.concatenate(ps), np.concatenate(ns), np.concatenate(js), np.concatenate(ws), np.concatenate(is_), np.concatenate(ts))
    return merged

def bound_textures(prim):
    """The diffuse and normal map files of the material bound to a mesh (UsdPreviewSurface + UsdUVTexture), if any."""
    mat = UsdShade.MaterialBindingAPI(prim).ComputeBoundMaterial()[0]
    if not mat: return {}
    out = {}
    for sh in [UsdShade.Shader(c) for c in mat.GetPrim().GetChildren() if c.IsA(UsdShade.Shader)]:
        if sh.GetIdAttr().Get() != "UsdPreviewSurface": continue
        for name, key in (("diffuseColor", "diffuse"), ("normal", "normal")):
            inp = sh.GetInput(name)
            if inp and inp.HasConnectedSource():
                tex = UsdShade.Shader(inp.GetConnectedSource()[0].GetPrim()); f = tex.GetInput("file")
                if f and f.Get(): out[key] = f.Get().resolvedPath or f.Get().path
    return out

def image_bytes(path, max_size, kind):
    """A texture file resized for the web: JPEG for colour maps without alpha, PNG otherwise."""
    from PIL import Image
    import io
    im = Image.open(path)
    if max(im.size) > max_size: im = im.resize((min(im.size[0], max_size), min(im.size[1], max_size)), Image.LANCZOS)
    buf = io.BytesIO()
    if im.mode == "RGBA" or kind == "normal": im.save(buf, format="PNG", optimize=True); return buf.getvalue(), "image/png"
    im.convert("RGB").save(buf, format="JPEG", quality=86); return buf.getvalue(), "image/jpeg"

class Glb:
    def __init__(self): self.bin = bytearray(); self.views = []; self.accessors = []
    def acc(self, arr, ctype, atype, minmax=False, target=None):
        arr = np.ascontiguousarray(arr)
        while len(self.bin) % 4: self.bin.append(0)
        off = len(self.bin); self.bin += arr.tobytes()
        v = {"buffer": 0, "byteOffset": off, "byteLength": arr.nbytes}
        if target: v["target"] = target
        self.views.append(v)
        a = {"bufferView": len(self.views) - 1, "componentType": ctype, "count": len(arr) if arr.ndim > 1 or atype == "SCALAR" else len(arr), "type": atype}
        if atype == "SCALAR": a["count"] = arr.size
        if minmax: a["min"] = arr.min(0).tolist(); a["max"] = arr.max(0).tolist()
        self.accessors.append(a); return len(self.accessors) - 1

def main(spec_path):
    spec = json.load(open(spec_path))
    base = os.path.dirname(os.path.abspath(spec_path))
    scale = float(spec.get("scale", 1))
    global TURN
    a = np.radians(float(spec.get("turn", 0))); TURN = np.array([[np.cos(a), 0, -np.sin(a), 0], [0, 1, 0, 0], [np.sin(a), 0, np.cos(a), 0], [0, 0, 0, 1]])
    g = Glb(); nodes = []; meshes = []; materials = {}; images = []; textures = []; tex_index = {}; skin_joints = None
    names = parents = W = locals_ = None
    for pi, part in enumerate(spec["parts"]):
        path = expand(part["file"], base)
        stage, skel, skelroot, mprims, xc = load(path)
        n2, p2, W2, L2, X = skeleton(skel, skelroot, xc, scale)
        if names is None:
            names, parents, W, locals_ = n2, p2, W2, L2
            ibm = np.array([np.linalg.inv(w) for w in W], dtype=np.float32)  # row-convention inverse == column-major glTF layout
            for i, nm in enumerate(names):
                L = locals_[i]; nodes.append({"name": nm, "translation": L[3, :3].tolist(), "rotation": quat_from_mat(L), "children": []})
            for i, p in enumerate(parents):
                if p >= 0: nodes[p]["children"].append(i)
            skin_joints = list(range(len(names)))
            skin = {"name": "Rig", "joints": skin_joints, "inverseBindMatrices": g.acc(ibm.reshape(-1, 16), 5126, "MAT4"), "skeleton": 0}
        else:
            if n2 != names: print(f"  warning: {os.path.basename(path)} has a different joint list"); 
            d = max(float(np.abs(a - b).max()) for a, b in zip(W, W2))
            if d > 1e-3: print(f"  warning: {os.path.basename(path)} bind pose differs by {d:.4f}")
        prims = []
        textured = set(part.get("textured", []))  # output materials that take the mesh's own colour (and normal) map
        for mprim in mprims:
            # "subsets" applies to every mesh in the file; "meshes": {name: subsets} picks per mesh (others are skipped)
            mspec = part["meshes"].get(mprim.GetName()) if "meshes" in part else part["subsets"]
            if mspec is None: continue
            bound_name = UsdShade.MaterialBindingAPI(mprim).ComputeBoundMaterial()[0]; bound_name = bound_name.GetPrim().GetName() if bound_name else "material"
            for matname, (P, N, J, Wt, I, T) in mesh_part(mprim, names, X, scale, mspec).items():
                if matname == "@": matname = bound_name  # named after the USD material (a modular outfit piece keeps its own)
                if "@" in textured: textured.add(matname)
                if matname not in materials:
                    col = srgb2lin(hex2rgb(COLORS.get(matname, "#888888")))
                    materials[matname] = {"name": matname, "pbrMetallicRoughness": {"baseColorFactor": col + [1], "metallicFactor": 0, "roughnessFactor": ROUGH.get(matname, 0.75)}}
                    if matname == "hair": materials[matname]["doubleSided"] = True
                    if matname in textured:
                        maps = bound_textures(mprim)
                        for kind, slot in (("diffuse", "baseColorTexture"), ("normal", "normalTexture")):
                            if kind not in maps: continue
                            if kind == "normal" and not part.get("normals", False): continue
                            tkey = (maps[kind], kind)
                            if tkey not in tex_index:
                                data, mime = image_bytes(maps[kind], int(part.get("textureSize", 1024)) if kind == "diffuse" else 512, kind)
                                while len(g.bin) % 4: g.bin.append(0)
                                g.views.append({"buffer": 0, "byteOffset": len(g.bin), "byteLength": len(data)}); g.bin += data
                                images.append({"bufferView": len(g.views) - 1, "mimeType": mime}); textures.append({"source": len(images) - 1, "sampler": 0})
                                tex_index[tkey] = len(textures) - 1
                                print(f"  texture {os.path.basename(maps[kind])} ({kind}) → {len(data)//1024} KB")
                            ref = {"index": tex_index[tkey]}
                            if slot == "baseColorTexture": materials[matname]["pbrMetallicRoughness"]["baseColorTexture"] = ref; materials[matname]["pbrMetallicRoughness"]["baseColorFactor"] = [1, 1, 1, 1]
                            else: materials[matname]["normalTexture"] = ref
                mi = list(materials).index(matname)
                attrs = {"POSITION": g.acc(P, 5126, "VEC3", True, 34962), "NORMAL": g.acc(N, 5126, "VEC3", False, 34962), "JOINTS_0": g.acc(J, 5123, "VEC4", False, 34962), "WEIGHTS_0": g.acc(Wt, 5126, "VEC4", False, 34962)}
                if matname in textured: attrs["TEXCOORD_0"] = g.acc(T, 5126, "VEC2", False, 34962)
                prims.append({"attributes": attrs, "indices": g.acc(I, 5125, "SCALAR", False, 34963), "material": mi, "mode": 4})
                print(f"  {part['node']}/{matname}: {len(P)} vertices, {len(I)//3} triangles")
        meshes.append({"name": part["node"], "primitives": prims})
        nodes.append({"name": part["node"], "mesh": len(meshes) - 1, "skin": 0})
    gltf = {"asset": {"version": "2.0", "generator": "forevercomiccon usd-to-glb"}, "scene": 0, "scenes": [{"name": "Scene", "nodes": [0] + list(range(len(names), len(nodes)))}], "nodes": nodes, "meshes": meshes, "skins": [skin], "materials": list(materials.values()), "images": images, "textures": textures, "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}], "accessors": g.accessors, "bufferViews": g.views, "buffers": [{"byteLength": len(g.bin)}]}
    for n in nodes:
        if "children" in n and not n["children"]: del n["children"]
    js = json.dumps(gltf, separators=(",", ":")).encode()
    while len(js) % 4: js += b" "
    while len(g.bin) % 4: g.bin.append(0)
    out = expand(spec["out"], base)
    with open(out, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(g.bin)))
        f.write(struct.pack("<II", len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack("<II", len(g.bin), 0x004E4942)); f.write(g.bin)
    print(f"wrote {out} ({os.path.getsize(out)//1024} KB)")

if __name__ == "__main__": main(sys.argv[1])
