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
COLORS = {"skin": "#ffdfc4", "hair": "#2b1b12", "brow": "#2b1b12", "shirt": "#e63946", "pants": "#1f2a44", "belt": "#2a1d14", "face": "#ffffff", "shoes": "#1b1b1f", "costume": "#b91c1c", "costume2": "#facc15", "prop": "#4b5563", "eye": "#15110f"}
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

def mesh_part(prim, names, X, scale, subsets_wanted, rebind=None, W=None, slim=None):
    """Returns {material: (positions, normals, joints, weights, indices)} for the wanted subsets of one USD mesh.
    rebind: per joint, the matrix taking this file's bind pose onto the body's (a hair file skinned in a slightly
    different pose would otherwise sit where its own skeleton put it, not on this head)."""
    mesh = UsdGeom.Mesh(prim)
    pts = np.array(mesh.GetPointsAttr().Get(), dtype=np.float64)
    fvc = np.array(mesh.GetFaceVertexCountsAttr().Get()); fvi = np.array(mesh.GetFaceVertexIndicesAttr().Get())
    binding = UsdSkel.BindingAPI(prim)
    gbt = binding.GetGeomBindTransformAttr().Get()
    M = (mat_np(gbt) if gbt is not None else np.eye(4)) @ X
    P = np.c_[pts, np.ones(len(pts))] @ M
    P = P[:, :3] * scale
    if slim and W is not None: P = slim_points(P, names, W, slim)
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
    if rebind is not None:  # linear-blend the bind-pose correction into the points (and the corner normals, by their strongest joint)
        P4 = np.c_[P, np.ones(len(P))]; Pr = np.zeros_like(P)
        for k in range(4): Pr += w4[:, k:k + 1] * np.stack([(P4[i] @ rebind[j])[:3] for i, j in enumerate(idx4[:, k])])
        P = Pr
        if N is not None: Rc = np.stack([rebind[j][:3, :3] for j in idx4[fvi, 0]]); N = np.einsum("ij,ijk->ik", N, Rc)
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

def image_bytes(path, max_size, kind, tint=False):
    """A texture file resized for the web: JPEG for colour maps without alpha, PNG otherwise. `tint`: the map becomes a
    luminance map with its mean lifted to 0.72, so the runtime's material colour (a skin tone, a shirt colour) multiplies
    onto the shading detail and comes out as the colour chosen, whatever the painted colour was."""
    from PIL import Image
    import io
    im = Image.open(path)
    if max(im.size) > max_size: im = im.resize((min(im.size[0], max_size), min(im.size[1], max_size)), Image.LANCZOS)
    if tint:
        alpha = im.getchannel("A") if im.mode == "RGBA" else None
        lum = np.asarray(im.convert("L"), dtype=np.float32) / 255
        lum = np.clip(lum * (0.72 / max(1e-3, float(lum.mean()))), 0, 1)
        im = Image.fromarray((lum * 255).astype(np.uint8)).convert("RGB")
        if alpha is not None: im.putalpha(alpha)
    buf = io.BytesIO()
    if im.mode == "RGBA" or kind == "normal": im.save(buf, format="PNG", optimize=True); return buf.getvalue(), "image/png"
    im.convert("RGB").save(buf, format="JPEG", quality=86); return buf.getvalue(), "image/jpeg"

def clip_tris(attrs, tris, n, d, interp=None, sd=None, skin=(2, 3)):
    """Keeps the part of a triangle mesh on the side of the plane dot(p, n) >= d (or, with sd, where that per-vertex
    signed distance is >= 0), splitting the triangles it cuts so the edge is a clean line. attrs: list of per-vertex
    arrays (positions first); shared cut edges stay welded. interp: per attribute, whether a cut vertex blends it
    (positions, normals) or takes the nearer end's (bone slots)."""
    P = attrs[0]; sd = (P @ n - d) if sd is None else np.asarray(sd, dtype=np.float64); out = []; cache = {}
    interp = interp or [True] * len(attrs)
    attrs = [list(a) for a in attrs]
    def cut(i, j):
        key = (min(i, j), max(i, j))
        if key in cache: return cache[key]
        t = sd[i] / (sd[i] - sd[j])
        for k, (a, blend) in enumerate(zip(attrs, interp)):
            if skin and k == skin[0]:
                # bone slots: merge the two ends' (joint, weight) sets by t, keep the four strongest, so the cut edge
                # moves smoothly with the body instead of tearing where the two ends follow different bones
                ji, wi, jj, wj = attrs[skin[0]][i], attrs[skin[1]][i], attrs[skin[0]][j], attrs[skin[1]][j]
                acc = {}
                for jn, wn in zip(ji, wi): acc[int(jn)] = acc.get(int(jn), 0.0) + float(wn) * (1 - t)
                for jn, wn in zip(jj, wj): acc[int(jn)] = acc.get(int(jn), 0.0) + float(wn) * t
                top = sorted(acc.items(), key=lambda kv: -kv[1])[:4]
                while len(top) < 4: top.append((0, 0.0))
                tot = sum(w for _, w in top) or 1.0
                a.append(np.array([jn for jn, _ in top], dtype=a[i].dtype)); attrs[skin[1]].append(np.array([w / tot for _, w in top], dtype=attrs[skin[1]][i].dtype))
            elif skin and k == skin[1]: continue
            else: a.append(a[i] + (a[j] - a[i]) * t if blend else (a[i] if t < 0.5 else a[j]))
        cache[key] = len(attrs[0]) - 1; return cache[key]
    for tri in tris:
        inside = [v for v in tri if sd[v] >= 0]
        if len(inside) == 3: out.append(tuple(tri)); continue
        if len(inside) == 0: continue
        a, b, c = tri
        # rotate so the odd vertex comes first
        for _ in range(3):
            if (sd[a] >= 0) != (sd[b] >= 0) and (sd[a] >= 0) != (sd[c] >= 0): break
            a, b, c = b, c, a
        ab, ac = cut(a, b), cut(a, c)
        if sd[a] >= 0: out.append((a, ab, ac))            # one corner kept
        else: out.append((b, c, ac)); out.append((b, ac, ab))  # two corners kept
    attrs = [np.array(a) for a in attrs]
    return attrs, np.array(out, dtype=int).reshape(-1, 3)

def slim_points(P, names, W, slim):
    """Narrows the hips, thighs and calves toward the body's centre line: x and z scaled by `slim` from the hip crest
    to the ankles, blending back to 1 over the lower ribs and over the foot, so the bust and the feet keep their size."""
    if not slim or float(slim) >= 1: return P
    pos = {n: W[i][3, :3] for i, n in enumerate(names)}
    hip, chest, ankle = pos["pelvis"][1] + 0.3, pos["spine_03"][1], pos["foot_l"][1] + 0.1
    y = P[:, 1]
    w = np.where(y > hip, np.clip((chest - y) / max(1e-6, chest - hip), 0, 1), np.clip((y - (ankle - 0.3)) / 0.3, 0, 1))
    f = 1 - (1 - float(slim)) * w
    Q = P.copy(); cz = pos["pelvis"][2]
    Q[:, 0] = P[:, 0] * f; Q[:, 2] = cz + (P[:, 2] - cz) * f
    return Q

def skinned_body(prim, names, X, scale, W=None, slim=None):
    """A skinned mesh as world-space positions, smooth vertex normals, its 4 strongest bone slots per vertex and triangles."""
    mesh = UsdGeom.Mesh(prim)
    pts = np.array(mesh.GetPointsAttr().Get(), dtype=np.float64)
    fvc = np.array(mesh.GetFaceVertexCountsAttr().Get()); fvi = np.array(mesh.GetFaceVertexIndicesAttr().Get())
    binding = UsdSkel.BindingAPI(prim)
    gbt = binding.GetGeomBindTransformAttr().Get(); M = (mat_np(gbt) if gbt is not None else np.eye(4)) @ X
    P = (np.c_[pts, np.ones(len(pts))] @ M)[:, :3] * scale
    if slim and W is not None: P = slim_points(P, names, W, slim)
    ji = binding.GetJointIndicesPrimvar(); jw = binding.GetJointWeightsPrimvar(); es = ji.GetElementSize()
    idx = np.array(ji.Get()).reshape(-1, es); wts = np.array(jw.Get(), dtype=np.float64).reshape(-1, es)
    bound = binding.GetJointsAttr().Get()
    if bound: idx = np.array([names.index(j.split("/")[-1]) for j in bound])[idx]
    order = np.argsort(-wts, axis=1)[:, :4]; idx4 = np.take_along_axis(idx, order, 1).astype(np.float64); w4 = np.take_along_axis(wts, order, 1)
    if idx4.shape[1] < 4: pad = 4 - idx4.shape[1]; idx4 = np.pad(idx4, ((0, 0), (0, pad))); w4 = np.pad(w4, ((0, 0), (0, pad)))
    w4 = w4 / np.maximum(w4.sum(1, keepdims=True), 1e-9)
    offsets = np.r_[0, np.cumsum(fvc)[:-1]]; tris = []
    for f in range(len(fvc)):
        o, c = offsets[f], fvc[f]
        for t in range(1, c - 1): tris.append((fvi[o], fvi[o + t], fvi[o + t + 1]))
    tris = np.array(tris)
    fn = np.cross(P[tris[:, 1]] - P[tris[:, 0]], P[tris[:, 2]] - P[tris[:, 0]])
    vn = np.zeros_like(P)
    for k in range(3): np.add.at(vn, tris[:, k], fn)
    vn /= np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-9)
    return P, vn, idx4, w4, tris

def hair_cap(prim, names, W, X, scale, opts):
    """
    A curly hairstyle grown from the scalp (the pack has no curly hair): the head's skin above a slanted hairline (high
    on the forehead, down to the nape behind) pushed out along its normals in a thick, bumpy shell that tapers back to
    the skin at the hairline. Spherical UVs let the pack's hair texture tile over it. Returns {"hair": arrays}.
    """
    P, vn, idx4, w4, tris = skinned_body(prim, names, X, scale)
    pos = {n: W[i][3, :3] for i, n in enumerate(names)}
    head = pos["Head"]; top = P[:, 1].max()
    near = P[(P[:, 1] > head[1]) & (np.abs(P[:, 0]) < 0.6)]
    zf, zb = near[:, 2].max(), near[:, 2].min()  # the face and the back of the skull
    k = float(opts.get("slope", 0.75)); front = top - float(opts.get("forehead", 0.26))
    # hairline plane: y >= front - k * (zf - z)  →  dot(p, (0, 1, k)) >= front - k * zf
    planes = [(np.array([0.0, 1.0, -k]), front - k * zf), (np.array([0.0, 1.0, 0.0]), top - float(opts.get("depth", 0.72)))]
    attrs, t = [P.copy(), vn.copy(), idx4.copy(), w4.copy()], tris.copy()
    for n, d in planes: attrs, t = clip_tris(attrs, t, n, d, [True, True, False, False])
    used = np.unique(t); remap = -np.ones(len(attrs[0]), dtype=int); remap[used] = np.arange(len(used))
    Pn, Nn, Jn, Wn = (a[used] for a in attrs); tt = remap[t]
    Nn = Nn / np.maximum(np.linalg.norm(Nn, axis=1, keepdims=True), 1e-9)
    sd = np.min([Pn @ n - d for n, d in planes], axis=0)             # distance inside the hairline
    taper = np.clip(sd / float(opts.get("fade", 0.3)), 0.12, 1.0)
    f = float(opts.get("curl", 36.0)); amp = float(opts.get("bump", 0.14)); thick = float(opts.get("thick", 0.14))
    bumps = 0.5 + 0.5 * np.sin(Pn[:, 0] * f) * np.sin(Pn[:, 1] * f * 1.13 + 1.7) * np.sin(Pn[:, 2] * f * 0.91 + 0.4)
    grow = (thick + amp * bumps) * taper
    Q = Pn + Nn * grow[:, None]
    fn2 = np.cross(Q[tt[:, 1]] - Q[tt[:, 0]], Q[tt[:, 2]] - Q[tt[:, 0]]); N2 = np.zeros_like(Q)
    for kk in range(3): np.add.at(N2, tt[:, kk], fn2)
    N2 /= np.maximum(np.linalg.norm(N2, axis=1, keepdims=True), 1e-9)
    c = np.array([0.0, head[1] + 0.3, (zf + zb) / 2]); d = Q - c; d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)
    uv = np.c_[np.arctan2(d[:, 0], d[:, 2]) / (2 * np.pi) * float(opts.get("tile", 6)), np.arccos(np.clip(d[:, 1], -1, 1)) / np.pi * float(opts.get("tile", 6)) * 0.5]
    Q = Q.astype(np.float32); N2 = N2.astype(np.float32); Jn = Jn.astype(np.uint16); Wn = Wn.astype(np.float32); I = tt.reshape(-1).astype(np.uint32); uv = uv.astype(np.float32)
    if opts.get("knot"):  # a top knot: a sphere of hair on the crown, a little back, bound to the head
        kr = float(opts["knot"].get("r", 0.2)); kc = np.array([0.0, top + float(opts["knot"].get("up", 0.05)), (zf + zb) / 2 - float(opts["knot"].get("back", 0.12))])
        hj = names.index("Head"); sv, sn, suv, si = [], [], [], []; rings, segs = 10, 14
        for a_i in range(rings + 1):
            ph = np.pi * a_i / rings
            for b_i in range(segs):
                th = 2 * np.pi * b_i / segs; nrm = np.array([np.sin(ph) * np.cos(th), np.cos(ph), np.sin(ph) * np.sin(th)])
                sv.append(kc + nrm * kr); sn.append(nrm); suv.append((b_i / segs * 2, a_i / rings))
        for a_i in range(rings):
            for b_i in range(segs):
                p0 = a_i * segs + b_i; p1 = a_i * segs + (b_i + 1) % segs; p2 = p0 + segs; p3 = p1 + segs
                si += [p0, p2, p1, p1, p2, p3]
        off_v = len(Q)
        Q = np.concatenate([Q, np.array(sv, np.float32)]); N2 = np.concatenate([N2, np.array(sn, np.float32)]); uv = np.concatenate([uv, np.array(suv, np.float32)])
        Jn = np.concatenate([Jn, np.full((len(sv), 4), 0, np.uint16)]); Jn[off_v:, 0] = hj; Wn = np.concatenate([Wn, np.tile(np.array([1, 0, 0, 0], np.float32), (len(sv), 1))])
        I = np.concatenate([I, (np.array(si, np.uint32) + off_v)])
    print(f"  hair cap: {len(Q)} vertices, {len(I)//3} triangles")
    return {"hair": (Q, N2, Jn, Wn, I, uv)}

def clothe(prim, names, W, X, scale, opts):
    """
    Regular clothes grown from the body itself: a T-shirt, trousers and shoes as thin shells pushed out along the
    body's smooth normals, so they are seamless and deform exactly with it (same skin weights). Each garment is the
    body surface cut by planes (a collar below the neck, sleeves across the upper arms, a hem at the hips, an ankle
    line), the triangles split on the planes so every edge is a clean line. Returns {material: arrays} like mesh_part.
    """
    P, vn, idx4, w4, tris = skinned_body(prim, names, X, scale, W, opts.get("slim"))
    pos = {n: W[i][3, :3] for i, n in enumerate(names)}
    neck, pelvis, foot = pos["neck_01"], pos["pelvis"], pos["foot_l"]
    Y = np.array([0.0, 1.0, 0.0])
    sleeve = float(opts.get("sleeve", 0.5)); off = float(opts.get("offset", 0.065)); shoe_off = float(opts.get("shoes", 0.1))
    collar = neck[1] + 0.1; hem = pelvis[1] - float(opts.get("hem", 0.15)); ankle = foot[1] + float(opts.get("ankle", 0.12))
    def garment(planes, grow, slack=0.0, smooth=None, collar_r=None):
        attrs, t = [P.copy(), vn.copy(), idx4.copy(), w4.copy()], tris.copy()
        for n, d in planes: attrs, t = clip_tris(attrs, t, n, d, [True, True, False, False])
        if collar_r:  # crew neck: drop what lies inside a cylinder round the neck above the collarbone line
            # the chest slopes away in front, so a plain cylinder would scoop into a V there: the front radius is shorter
            Pc = attrs[0]; dz = Pc[:, 2] - (neck[2] + 0.06); radial = np.hypot(Pc[:, 0] - neck[0], np.where(dz > 0, dz * 2.4, dz)) - collar_r
            attrs, t = clip_tris(attrs, t, None, None, [True, True, False, False], sd=np.maximum(radial, (neck[1] - 0.45) - Pc[:, 1]))
        if len(t) == 0: return None
        used = np.unique(t); remap = -np.ones(len(attrs[0]), dtype=int); remap[used] = np.arange(len(used))
        Pn, Nn, Jn, Wn = (a[used] for a in attrs)
        Nn = Nn / np.maximum(np.linalg.norm(Nn, axis=1, keepdims=True), 1e-9)
        Jn = Jn.astype(np.uint16)
        tt = remap[t]
        # cloth drapes: a few rounds of Laplacian smoothing on the shell (the cut edges stay put) soften the body's muscle
        # detail under the garment; the normals are recomputed from the smoothed surface
        nb = [set() for _ in range(len(Pn))]; edge_count = {}
        for a, b, c in tt:
            for i, j in ((a, b), (b, c), (c, a)): nb[i].add(j); nb[j].add(i); e = (min(i, j), max(i, j)); edge_count[e] = edge_count.get(e, 0) + 1
        boundary = np.zeros(len(Pn), dtype=bool)
        for (i, j), cnt in edge_count.items():
            if cnt == 1: boundary[i] = boundary[j] = True
        Q = Pn.copy()
        for _ in range(int(opts.get("smooth", 3)) if smooth is None else int(smooth)):
            R = Q.copy()
            for i in range(len(Q)):
                if boundary[i] or not nb[i]: continue
                R[i] = Q[i] * 0.4 + np.mean(Q[list(nb[i])], axis=0) * 0.6
            Q = R
        # smoothing pulls convex places (thighs, chest) inward: never let the cloth sink below the body surface. A loose
        # garment (slack > 0) may sink part of its offset, so muscle and ribs stop printing through while the shell still
        # clears the skin by the rest of it
        inward = np.minimum(0, np.einsum("ij,ij->i", Q - Pn, Nn) + grow * slack); Q = Q - Nn * inward[:, None]
        fn2 = np.cross(Q[tt[:, 1]] - Q[tt[:, 0]], Q[tt[:, 2]] - Q[tt[:, 0]]); N2 = np.zeros_like(Q)
        for k in range(3): np.add.at(N2, tt[:, k], fn2)
        N2 /= np.maximum(np.linalg.norm(N2, axis=1, keepdims=True), 1e-9)
        # pushed out along the body's own normals (so the shell never dips inside), but shaded with its own smoother ones
        return ((Q + Nn * grow).astype(np.float32), N2.astype(np.float32), Jn, Wn.astype(np.float32), tt.reshape(-1).astype(np.uint32), np.zeros((len(used), 2), np.float32))
    # sleeves: a plane across each upper arm, half way to the elbow, keeping the shoulder side
    sleeves = []
    for side in "lr":
        a, b = pos["upperarm_" + side], pos["lowerarm_" + side]; axis = (b - a) / np.linalg.norm(b - a); cutp = a + axis * sleeve * np.linalg.norm(b - a)
        sleeves.append((-axis, -float(axis @ cutp)))
    out = {}
    shirt = garment([(-Y, -collar), (Y, hem)] + sleeves, off, float(opts.get("slack", 0.0)), None, float(opts.get("collar", 0.3)))  # above the hem, inside the sleeve lines, round the neck
    pants = garment([(-Y, -(pelvis[1] + 0.35)), (Y, ankle)], float(opts.get("pants", off * 0.75)))  # from under the shirt down to the ankle line, a little closer to the body than the shirt that hangs over it
    # shoes: a shell over the foot keeps every toe (each is its own tube, so no smoothing bridges them), so the shoe is
    # a built last instead: rounded cross-sections along the foot, as wide and as high as the foot plus the offset,
    # closed at the heel and tapered at the toe, skinned to the foot and ball bones. The foot's skin is hidden inside.
    def shoe(side):
        # a low shoe: as long as the foot plus a thin toe cap and heel, as wide as the foot plus the offset, the collar at
        # the ankle bone (just above the trouser hem), the instep following the foot's own height and the toe box
        # rounding off low and wide like a sneaker
        sx = 1 if side == "l" else -1
        F = P[(P[:, 1] < ankle + 0.08) & (np.sign(P[:, 0]) == sx) & (np.abs(P[:, 0]) > 0.03)]
        if len(F) < 10: return None
        sole = 0.045; top = ankle + 0.04; fb, bb = names.index("foot_" + side), names.index("ball_" + side); ball_z = pos["ball_" + side][2]
        n_sec, n_ring, e = 20, 16, 2.4
        z0, z1 = F[:, 2].min() - 0.03, F[:, 2].max() + 0.05
        zs = np.linspace(z0, z1, n_sec)
        V, J, Wt = [], [], []
        for i, z in enumerate(zs):
            win = F[np.abs(F[:, 2] - z) < 0.07]
            if len(win) < 4: win = F[np.argsort(np.abs(F[:, 2] - z))[:24]]
            cx = (win[:, 0].min() + win[:, 0].max()) / 2
            w = win[:, 0].max() - win[:, 0].min() + 2 * shoe_off
            h = min(top, win[:, 1].max() + shoe_off * 0.8)
            t = i / (n_sec - 1)
            if t < 0.12: r = np.sqrt(max(0.0, 1 - ((0.12 - t) / 0.12) ** 2)); w *= 0.45 + 0.55 * r                 # heel: rounded back, full height
            elif t > 0.8: r = np.sqrt(max(0.0, 1 - ((t - 0.8) / 0.2) ** 2)); w *= 0.35 + 0.65 * r; h = sole + (h - sole) * (0.45 + 0.55 * r)  # toe box: rounds off, stays low
            wb = float(np.clip((z - (ball_z - 0.05)) / 0.1, 0, 1))
            for k in range(n_ring):
                a = 2 * np.pi * k / n_ring; c, sn = np.cos(a), np.sin(a)
                x = cx + (w / 2) * np.sign(c) * abs(c) ** (2 / e)
                y = (h / 2) + (h / 2) * np.sign(sn) * abs(sn) ** (2 / e)
                V.append((x, max(0.0, y), z)); J.append((fb, bb, 0, 0)); Wt.append((1 - wb, wb, 0, 0))
        heel = len(V); V.append(((V[0][0] + V[n_ring // 2][0]) / 2, (V[n_ring // 4][1] + V[3 * n_ring // 4][1]) / 2, z0 - 0.01)); J.append((fb, bb, 0, 0)); Wt.append((1, 0, 0, 0))
        base = (n_sec - 1) * n_ring
        toe = len(V); V.append(((V[base][0] + V[base + n_ring // 2][0]) / 2, (V[base + n_ring // 4][1] + V[base + 3 * n_ring // 4][1]) / 2, z1 + 0.01)); J.append((fb, bb, 0, 0)); Wt.append((0, 1, 0, 0))
        T = []
        for i in range(n_sec - 1):
            for k in range(n_ring):
                a, b = i * n_ring + k, i * n_ring + (k + 1) % n_ring; c, d = a + n_ring, b + n_ring
                T.append((a, c, b)); T.append((b, c, d))
        for k in range(n_ring): T.append((heel, k, (k + 1) % n_ring)); T.append((toe, base + (k + 1) % n_ring, base + k))
        V = np.array(V); T = np.array(T)
        fn = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]]); N = np.zeros_like(V)
        for kk in range(3): np.add.at(N, T[:, kk], fn)
        if np.einsum("ij,ij->i", N, V - V.mean(0)).sum() < 0: T = T[:, ::-1]; N = -N  # wound inside out: flip
        N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
        print(f"  shoe {side}: {z1 - z0:.2f} long, {top:.2f} high at the collar")
        return (V.astype(np.float32), N.astype(np.float32), np.array(J, np.uint16), np.array(Wt, np.float32), T.reshape(-1).astype(np.uint32), np.zeros((len(V), 2), np.float32))
    parts = [g for g in (shoe("l"), shoe("r")) if g is not None]
    shoes = None
    if parts:
        off_i = 0; Ps, Ns, Js, Ws, Is, Ts = [], [], [], [], [], []
        for g in parts: Ps.append(g[0]); Ns.append(g[1]); Js.append(g[2]); Ws.append(g[3]); Is.append(g[4] + off_i); Ts.append(g[5]); off_i += len(g[0])
        shoes = (np.concatenate(Ps), np.concatenate(Ns), np.concatenate(Js), np.concatenate(Ws), np.concatenate(Is), np.concatenate(Ts))
    for matname, g in (("shirt", shirt), ("pants", pants), ("shoes", shoes)):
        if g is None: continue
        out[matname] = g; print(f"  clothes/{matname}: {len(g[0])} vertices, {len(g[4])//3} triangles")
    return out

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
    names = parents = W = locals_ = None; rebind = None
    for pi, part in enumerate(spec["parts"]):
        path = expand(part["file"], base)
        stage, skel, skelroot, mprims, xc = load(path)
        n2, p2, W2, L2, X = skeleton(skel, skelroot, xc, scale)
        if names is None:
            names, parents, W, locals_ = n2, p2, W2, L2; rebind = None
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
            rebind = [np.linalg.inv(b) @ a for a, b in zip(W, W2)] if d > 1e-3 else None
            if d > 1e-3: print(f"  note: {os.path.basename(path)} bind pose differs by {d:.4f}; its meshes are rebound onto the body's")
        prims = []
        textured = set(part.get("textured", []))  # output materials that take the mesh's own colour (and normal) map
        for mprim in mprims:
            # "subsets" applies to every mesh in the file; "meshes": {name: subsets} picks per mesh (others are skipped)
            hair = part.get("hair") if part.get("hair", {}).get("mesh") == mprim.GetName() else None
            mspec = part["meshes"].get(mprim.GetName()) if "meshes" in part else part["subsets"]
            if mspec is None and not hair: continue
            bound_name = UsdShade.MaterialBindingAPI(mprim).ComputeBoundMaterial()[0]; bound_name = bound_name.GetPrim().GetName() if bound_name else "material"
            pieces = mesh_part(mprim, names, X, scale, mspec, rebind, W, part.get("clothes", {}).get("slim") if mprim.GetName() == part.get("clothes", {}).get("mesh") else None) if mspec else {}
            if "clothes" in part and mprim.GetName() == part["clothes"].get("mesh", mprim.GetName()): pieces.update(clothe(mprim, names, W, X, scale, part["clothes"]))
            if hair: pieces.update(hair_cap(mprim, names, W, X, scale, hair))
            for matname, (P, N, J, Wt, I, T) in pieces.items():
                if matname == "@": matname = bound_name  # named after the USD material (a modular outfit piece keeps its own)
                if "@" in textured: textured.add(matname)
                if matname not in materials:
                    col = srgb2lin(hex2rgb(COLORS.get(matname, "#888888")))
                    materials[matname] = {"name": matname, "pbrMetallicRoughness": {"baseColorFactor": col + [1], "metallicFactor": 0, "roughnessFactor": ROUGH.get(matname, 0.75)}}
                    if matname == "hair": materials[matname]["doubleSided"] = True
                    if matname in textured:
                        maps = {"diffuse": expand(hair["texture"], base)} if hair and hair.get("texture") else bound_textures(mprim)
                        for kind, slot in (("diffuse", "baseColorTexture"), ("normal", "normalTexture")):
                            if kind not in maps: continue
                            if kind == "normal" and not part.get("normals", False): continue
                            tinted = kind == "diffuse" and matname in set(part.get("tint", []))
                            tkey = (maps[kind], kind, tinted)
                            if tkey not in tex_index:
                                data, mime = image_bytes(maps[kind], int(part.get("textureSize", 1024)) if kind == "diffuse" else 512, kind, tinted)
                                while len(g.bin) % 4: g.bin.append(0)
                                g.views.append({"buffer": 0, "byteOffset": len(g.bin), "byteLength": len(data)}); g.bin += data
                                images.append({"bufferView": len(g.views) - 1, "mimeType": mime}); textures.append({"source": len(images) - 1, "sampler": 0})
                                tex_index[tkey] = len(textures) - 1
                                print(f"  texture {os.path.basename(maps[kind])} ({kind}) → {len(data)//1024} KB")
                            ref = {"index": tex_index[tkey]}
                            if slot == "baseColorTexture": materials[matname]["pbrMetallicRoughness"]["baseColorTexture"] = ref; materials[matname]["pbrMetallicRoughness"]["baseColorFactor"] = (srgb2lin(hex2rgb(COLORS[matname])) + [1]) if tinted and matname in COLORS else [1, 1, 1, 1]
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
