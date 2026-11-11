#!/usr/bin/env python3
"""
Builds a dressed, rigged human as a GLB from MakeHuman assets (all CC0).

    python3 scripts/avatars/mh-to-glb.py scripts/avatars/body-a.json

What goes in (paths in the spec are relative to ${MAKEHUMAN_DATA}, MakeHuman's `data` folder with its assets; the rig
and its weights come from MPFB2's data folder, ${MPFB_DATA}):

  - the base mesh (3dobjs/base.obj) and the macro targets that turn it into an adult man or woman;
  - the "game engine" rig (53 joints, Unreal-style names) and its vertex weights;
  - clothes, shoes, hair, eyes, eyebrows and eyelashes as MakeHuman proxies (.mhclo + .obj + textures): each proxy
    vertex is bound to three base-mesh vertices, so it is fitted to the body by construction and takes its skin
    weights from the same three vertices.

What comes out: one skinned glTF with the node and material names the hall's runtime works by (materials `skin eye
lash brow hair shirt pants shoes`, nodes `body`, `brows`, `hair_*`). Textures that the visitor recolours (skin, hair,
brows, shirt, trousers) are turned into neutral shading maps: the picked colour multiplies onto them.

The rest pose is MakeHuman's own (arms out and down). Every joint is world-aligned at rest (identity rotation), which
keeps retargeting and the costume fitting simple.
"""
import json, os, re, struct, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULTS = {
    "MAKEHUMAN_DATA": os.path.normpath(os.path.join(HERE, "../../../vidya-hub/makehuman-core/data")),
    "MPFB_DATA": os.path.normpath(os.path.join(HERE, "../../../makehumancommunity/mpfb2/src/mpfb/data")),
}
RENAME = {"Root": "root", "head": "Head"}  # the names the runtime already knows
DM_TO_FT = 0.328084


def expand(p, base=None):
    p = re.sub(r"\$\{(\w+)\}", lambda m: os.environ.get(m.group(1), DEFAULTS.get(m.group(1), "")), p)
    return p if os.path.isabs(p) or base is None else os.path.normpath(os.path.join(base, p))


def srgb2lin(c): c = np.asarray(c, dtype=np.float64); return np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
def lin2srgb(c): c = np.clip(np.asarray(c, dtype=np.float64), 0, 1); return np.where(c > 0.0031308, 1.055 * c ** (1 / 2.4) - 0.055, c * 12.92)
def hex2lin(h): return srgb2lin([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]).tolist()


# ---------- reading MakeHuman files ----------

def load_obj(path):
    """Positions, UVs and polygons (as lists of (vertex, uv) index pairs) of a Wavefront file, with the group of each face."""
    V, VT, faces, groups = [], [], [], []
    g = ""
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            if line.startswith("v "): V.append([float(x) for x in line.split()[1:4]])
            elif line.startswith("vt "): VT.append([float(x) for x in line.split()[1:3]])
            elif line.startswith("g "): g = line.split()[1] if len(line.split()) > 1 else ""
            elif line.startswith("f "):
                poly = []
                for tok in line.split()[1:]:
                    p = tok.split("/")
                    poly.append((int(p[0]) - 1, int(p[1]) - 1 if len(p) > 1 and p[1] else -1))
                faces.append(poly); groups.append(g)
    return np.array(V, dtype=np.float64), np.array(VT, dtype=np.float64) if VT else np.zeros((0, 2)), faces, groups


def load_target(path):
    idx, off = [], []
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            if not line.strip() or line.startswith("#"): continue
            p = line.split(); idx.append(int(p[0])); off.append([float(p[1]), float(p[2]), float(p[3])])
    return np.array(idx, dtype=int), np.array(off, dtype=np.float64).reshape(-1, 3)


def load_proxy(path):
    """A .mhclo: where each proxy vertex sits relative to three base-mesh vertices, the scale references, the base vertices it hides."""
    out = {"scale": {}, "refs": [], "w": [], "off": [], "delete": [], "obj": None, "material": None, "name": os.path.basename(path)}
    mode = None
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            s = line.strip()
            if not s or s.startswith("#"): continue
            p = s.split()
            if p[0] == "verts": mode = "verts"; continue
            if p[0] == "delete_verts": mode = "delete"; continue
            if p[0] in ("x_scale", "y_scale", "z_scale"): out["scale"]["xyz".index(p[0][0])] = (int(p[1]), int(p[2]), float(p[3])); continue
            if p[0] == "obj_file": out["obj"] = p[1]; continue
            if p[0] == "material": out["material"] = p[1]; continue
            if mode == "verts" and re.match(r"^-?\d", p[0]):
                if len(p) == 1: out["refs"].append([int(p[0])] * 3); out["w"].append([1.0, 0.0, 0.0]); out["off"].append([0.0, 0.0, 0.0])
                else: out["refs"].append([int(p[0]), int(p[1]), int(p[2])]); out["w"].append([float(x) for x in p[3:6]]); out["off"].append([float(x) for x in p[6:9]])
                continue
            if mode == "delete" and re.match(r"^\d", p[0]):
                i = 0
                while i < len(p):
                    if i + 2 < len(p) and p[i + 1] == "-": out["delete"].extend(range(int(p[i]), int(p[i + 2]) + 1)); i += 3
                    else: out["delete"].append(int(p[i])); i += 1
                continue
            # any other keyword (a material or weights file named after "verts 0", say) leaves the section open
    out["refs"] = np.array(out["refs"], dtype=int); out["w"] = np.array(out["w"]); out["off"] = np.array(out["off"])
    return out


def fit_proxy(px, H):
    """Proxy vertex positions on the morphed base mesh H: the weighted three references plus the offset, scaled to this body."""
    S = np.ones(3)
    for axis, (v1, v2, den) in px["scale"].items(): S[axis] = abs(H[v1, axis] - H[v2, axis]) / den
    r, w = px["refs"], px["w"]
    return H[r[:, 0]] * w[:, 0:1] + H[r[:, 1]] * w[:, 1:2] + H[r[:, 2]] * w[:, 2:3] + px["off"] * S


def mhmat_textures(path):
    out = {}
    if not os.path.exists(path): return out
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            p = line.split()
            if len(p) >= 2 and p[0].endswith("Texture"): out[p[0]] = os.path.normpath(os.path.join(os.path.dirname(path), p[1]))
    return out


# ---------- geometry ----------

def vertex_normals(P, polys):
    """Area-weighted smooth normals per position index, over polygons of any size."""
    N = np.zeros_like(P)
    for poly in polys:
        idx = [v for v, _ in poly]
        a = P[idx[0]]
        n = np.zeros(3)
        for k in range(1, len(idx) - 1): n += np.cross(P[idx[k]] - a, P[idx[k + 1]] - a)
        for v in idx: N[v] += n
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
    return N


def build_prim(P, N, J4, W4, VT, polys):
    """Splits vertices on UV seams and triangulates: arrays ready for a glTF primitive."""
    key = {}; pos, nrm, jnt, wgt, uv, idx = [], [], [], [], [], []
    def corner(v, t):
        k = (v, t)
        i = key.get(k)
        if i is None:
            i = key[k] = len(pos)
            pos.append(P[v]); nrm.append(N[v]); jnt.append(J4[v]); wgt.append(W4[v])
            uv.append((VT[t][0], 1.0 - VT[t][1]) if t >= 0 and len(VT) else (0.0, 0.0))
        return i
    for poly in polys:
        c = [corner(v, t) for v, t in poly]
        for k in range(1, len(c) - 1): idx.extend((c[0], c[k], c[k + 1]))
    return (np.array(pos, np.float32), np.array(nrm, np.float32), np.array(jnt, np.uint16), np.array(wgt, np.float32), np.array(uv, np.float32), np.array(idx, np.uint32))


def top4(BW):
    """The four strongest joints per vertex of a dense weight matrix, renormalised."""
    order = np.argsort(-BW, axis=1)[:, :4]
    w = np.take_along_axis(BW, order, 1)
    w = np.where(w > 1e-5, w, 0.0)
    s = w.sum(1, keepdims=True)
    w = np.where(s > 0, w / np.maximum(s, 1e-12), np.array([1.0, 0, 0, 0]))
    j = np.where(w > 0, order, 0)
    return j.astype(np.uint16), w.astype(np.float32)


def components(polys, n):
    """Connected pieces of a mesh: a label per polygon (polygons sharing a position vertex are one piece)."""
    parent = list(range(n))
    def find(a):
        while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for poly in polys:
        r = find(poly[0][0])
        for v, _ in poly[1:]: parent[find(v)] = r
    return [find(poly[0][0]) for poly in polys]


def ray_hits(O, Dn, tris, tmax, chunk=192):
    """For each ray (origin O[i], unit direction Dn[i]): the distance to the nearest of the triangles within tmax, else inf."""
    A = tris[:, 0]; E1 = tris[:, 1] - A; E2 = tris[:, 2] - A
    out = np.full(len(O), np.inf)
    for i in range(0, len(O), chunk):
        o = O[i:i + chunk, None, :]; d = Dn[i:i + chunk, None, :]
        pv = np.cross(d, E2[None]); det = (E1[None] * pv).sum(-1)
        ok = np.abs(det) > 1e-12; inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
        tv = o - A[None]; u = (tv * pv).sum(-1) * inv
        qv = np.cross(tv, E1[None]); v = (d * qv).sum(-1) * inv; t = (E2[None] * qv).sum(-1) * inv
        hit = ok & (u >= -1e-6) & (v >= -1e-6) & (u + v <= 1 + 1e-6) & (t >= 0) & (t <= tmax)
        out[i:i + chunk] = np.where(hit, t, np.inf).min(1)
    return out


def rings_from(polys, n, start):
    """How many edges each vertex is from the nearest vertex in `start` (a boolean array), walking the mesh."""
    nb = [[] for _ in range(n)]
    for poly in polys:
        idx = [v for v, _ in poly]
        for k in range(len(idx)): a, b = idx[k], idx[(k + 1) % len(idx)]; nb[a].append(b); nb[b].append(a)
    depth = np.where(start, 0, -1); frontier = list(np.nonzero(start)[0])
    while frontier:
        nxt = []
        for a in frontier:
            for b in nb[a]:
                if depth[b] < 0: depth[b] = depth[a] + 1; nxt.append(b)
        frontier = nxt
    return np.where(depth < 0, 10 ** 6, depth)


# ---------- textures ----------

def load_rgba(path, size):
    im = Image.open(path).convert("RGBA")
    if max(im.size) > size: im = im.resize((size, size), Image.LANCZOS)
    return np.asarray(im, dtype=np.float64) / 255.0


def uv_mask(polys, VT, size, grow=0):
    """The texels a set of polygons covers, as a boolean image (optionally grown by a few pixels)."""
    im = Image.new("L", (size, size), 0); d = ImageDraw.Draw(im)
    for poly in polys:
        pts = [(VT[t][0] * size, (1 - VT[t][1]) * size) for _, t in poly if t >= 0]
        if len(pts) >= 3: d.polygon(pts, fill=255, outline=255)
    if grow: im = im.filter(ImageFilter.MaxFilter(grow * 2 + 1))
    return np.asarray(im) > 0


def shifted(a, dy, dx):
    """The image moved by (dy, dx) texels, edges repeated (no wrap-around)."""
    h, w = a.shape[:2]; pad = [(1, 1), (1, 1)] + [(0, 0)] * (a.ndim - 2)
    return np.pad(a, pad, mode="edge")[1 + dy:1 + dy + h, 1 + dx:1 + dx + w]


def inpaint(rgb, mask, rounds=60):
    """Fills masked texels from their unmasked neighbours, working inward."""
    rgb = rgb.copy(); todo = mask.copy()
    for _ in range(rounds):
        if not todo.any(): break
        known = ~todo
        acc = np.zeros_like(rgb); cnt = np.zeros(rgb.shape[:2])
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            k = shifted(known, dy, dx); acc += shifted(rgb, dy, dx) * k[..., None]; cnt += k
        fill = todo & (cnt > 0)
        rgb[fill] = acc[fill] / cnt[fill][:, None]
        todo = todo & ~fill
    return rgb


def blur(a, radius):
    """A Gaussian-like blur of a float image: three passes of a box filter (edges repeat)."""
    r = max(1, int(round(radius * 0.6))); a = np.asarray(a, dtype=np.float64)
    for _ in range(3):
        for axis in (0, 1):
            pad = [(r + 1, r) if k == axis else (0, 0) for k in range(2)]
            c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis)
            n = a.shape[axis]
            hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis); lo = np.take(c, np.arange(0, n), axis=axis)
            a = (hi - lo) / (2 * r + 1)
    return a


def grow(mask, px):
    return np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(px * 2 + 1))) > 0


def remove_print(rgb, mask, thresh=0.24, radius=14, spread=3):
    """Takes whatever is printed on a plain garment off its texture (a logo, piping, a contrast band): texels much
    lighter or darker than the cloth around them are refilled from their surroundings. Folds stay: they are gentle."""
    L = srgb2lin(rgb) @ np.array([0.2126, 0.7152, 0.0722]); w = mask.astype(np.float64); odd = np.zeros_like(mask)
    for _ in range(3):  # the cloth's own tone, re-estimated without the print found so far
        mean = blur(L * w, radius) / np.maximum(blur(w, radius), 1e-6)
        odd = mask & (np.abs(L - mean) > thresh * np.maximum(mean, 1e-3))
        w = (mask & ~odd).astype(np.float64)
    odd = grow(odd, spread) & mask
    # refilled from the cloth only (what lies outside the garment's own texels is unknown too), and only the garment's
    # texels are written back
    out = inpaint(rgb, odd | ~mask, 90)
    soft = blur(odd.astype(np.float64), 2.0)[..., None]  # the refilled texels are blended a little so no edge shows
    smooth = np.dstack([blur(out[..., k], 3.0) for k in range(3)])
    return np.where(mask[..., None], out * (1 - soft) + smooth * soft, rgb), odd


def shade_map(rgb, mask, ref_pct=90, level=0.95, gamma=1.0):
    """A neutral shading map from a coloured texture: its luminance, with the bright end of the masked area lifted to
    `level`, so a colour multiplied onto it comes out as that colour with the cloth's (or hair's) own shading."""
    lin = srgb2lin(rgb[..., :3]); L = lin @ np.array([0.2126, 0.7152, 0.0722])
    ref = np.percentile(L[mask], ref_pct) if mask.any() else L.max()
    out = np.clip(L / max(ref, 1e-6), 0, 1) ** gamma * level
    return lin2srgb(out)


def webp_bytes(arr, q=88):
    """Lossy WebP with its alpha channel: the cut-out maps (hair, brows, lashes) are several times smaller than as PNG."""
    import io
    im = Image.fromarray(np.clip(np.round(arr * 255), 0, 255).astype(np.uint8)); b = io.BytesIO(); im.save(b, "WEBP", quality=q, method=6); return b.getvalue(), "image/webp"

def jpg_bytes(arr, q=90):
    import io
    im = Image.fromarray(np.clip(np.round(arr[..., :3] * 255), 0, 255).astype(np.uint8)); b = io.BytesIO(); im.save(b, "JPEG", quality=q); return b.getvalue(), "image/jpeg"


# ---------- glTF ----------

class Glb:
    def __init__(self): self.bin = bytearray(); self.views = []; self.accessors = []
    def view(self, data, target=None):
        while len(self.bin) % 4: self.bin.append(0)
        v = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data)}
        if target: v["target"] = target
        self.bin += data; self.views.append(v); return len(self.views) - 1
    def acc(self, arr, ctype, atype, minmax=False, target=None):
        arr = np.ascontiguousarray(arr)
        a = {"bufferView": self.view(arr.tobytes(), target), "componentType": ctype, "count": arr.size if atype == "SCALAR" else len(arr), "type": atype}
        if minmax: a["min"] = arr.min(0).tolist(); a["max"] = arr.max(0).tolist()
        self.accessors.append(a); return len(self.accessors) - 1


def main(spec_path):
    spec = json.load(open(spec_path)); base = os.path.dirname(os.path.abspath(spec_path))
    data = expand(spec.get("data", "${MAKEHUMAN_DATA}"), base); mpfb = expand(spec.get("mpfb", "${MPFB_DATA}"), base)
    D = lambda p: os.path.join(data, p)
    tex_size = int(spec.get("textureSize", 1024))

    # --- the body: base mesh + targets ---
    H, HVT, hpolys, hgroups = load_obj(D("3dobjs/base.obj"))
    for name, weight in spec.get("targets", []):
        idx, off = load_target(D(f"targets/{name}.target"))
        H[idx] += off * float(weight)
        print(f"  target {name} x{weight}: {len(idx)} vertices")
    joint_pos = {}
    cube = {}
    for poly, g in zip(hpolys, hgroups):
        if g.startswith("joint-"): cube.setdefault(g, set()).update(v for v, _ in poly)
    for g, vs in cube.items(): joint_pos[g] = H[sorted(vs)].mean(0)

    # --- the rig ---
    rig = json.load(open(os.path.join(mpfb, "rigs/standard/rig.game_engine.json")))
    wfile = json.load(open(os.path.join(mpfb, "rigs/standard/weights.game_engine.json")))["weights"]
    def place(s):
        if s["strategy"] == "CUBE": return joint_pos[s["cube_name"]]
        if s["strategy"] == "MEAN": return H[s["vertex_indices"]].mean(0)
        if s["strategy"] == "VERTEX": return H[s["vertex_index"]]
        raise SystemExit(f"unknown joint strategy {s['strategy']}")
    order = []
    def visit(b):
        if b in order: return
        if rig[b]["parent"]: visit(rig[b]["parent"])
        order.append(b)
    for b in rig: visit(b)
    bones = [{"src": b, "name": RENAME.get(b, b), "parent": order.index(rig[b]["parent"]) if rig[b]["parent"] else -1, "head": place(rig[b]["head"]), "tail": place(rig[b]["tail"])} for b in order]
    # end markers for the retargeter (which way the head, hands and toes point): joints nothing is skinned to
    for b in list(bones):
        if b["name"] in ("Head", "ball_l", "ball_r", "hand_l", "hand_r"): bones.append({"src": None, "name": b["name"] + "_end", "parent": bones.index(b), "head": b["tail"], "tail": b["tail"]})
    nb = len(bones)
    BW = np.zeros((len(H), nb), dtype=np.float32)
    for bi, b in enumerate(bones):
        for v, w in (wfile.get(b["src"], []) if b["src"] else []): BW[v, bi] = w
    unweighted = np.nonzero(BW.sum(1) == 0)[0]

    # --- what is worn: proxies fitted to the body ---
    def proxy(rel):
        px = load_proxy(D(rel + ".mhclo")); folder = os.path.dirname(D(rel))
        PV, PVT, ppolys, _ = load_obj(os.path.join(folder, px["obj"]))
        P = fit_proxy(px, H)
        if len(P) != len(PV): raise SystemExit(f"{rel}: {len(P)} bindings for {len(PV)} vertices")
        r, w = px["refs"], np.clip(px["w"], 0, None)
        w = w / np.maximum(w.sum(1, keepdims=True), 1e-9)
        PW = BW[r[:, 0]] * w[:, 0:1] + BW[r[:, 1]] * w[:, 1:2] + BW[r[:, 2]] * w[:, 2:3]
        tex = mhmat_textures(os.path.join(folder, px["material"])) if px["material"] else {}
        return {"P": P, "VT": PVT, "polys": ppolys, "BW": PW, "delete": px["delete"], "tex": tex, "folder": folder, "rel": rel}

    worn = [dict(proxy(c["proxy"]), **{"spec": c}) for c in spec.get("clothes", [])]
    MIN_GAP = 0.07  # dm: what is covered sits at least this far under what covers it
    def tris_of(c): return np.array([[c["P"][poly[0][0]], c["P"][poly[k][0]], c["P"][poly[k + 1][0]]] for poly in c["polys"] for k in range(1, len(poly) - 1)])
    # A garment listed later goes under the ones before it (socks under trouser legs): what is covered is trimmed
    # away, and the covered edge that stays is drawn in, as the skin is below.
    for i, under in enumerate(worn):
        for over in worn[:i]:
            lo, hi = over["P"].min(0) - 0.6, over["P"].max(0) + 0.6
            near = np.nonzero(np.all((under["P"] >= lo) & (under["P"] <= hi), axis=1))[0]
            if not len(near): continue
            N = vertex_normals(under["P"], under["polys"]); gap = np.full(len(under["P"]), np.inf)
            gap[near] = ray_hits(under["P"][near] - N[near] * 0.03, N[near], tris_of(over), 0.55) - 0.03
            cov = np.isfinite(gap); depth = rings_from(under["polys"], len(under["P"]), ~cov)
            before = len(under["polys"])
            under["polys"] = [poly for poly in under["polys"] if not all(depth[v] >= 1 for v, _ in poly)]
            tuck = np.where(cov & (depth >= 1), np.clip(MIN_GAP - gap, 0, MIN_GAP), 0.0)
            under["P"] = under["P"] - N * tuck[:, None]
            print(f"  {under['rel']} under {over['rel']}: {before - len(under['polys'])} polygons trimmed, {int((tuck > 0).sum())} vertices drawn in")

    all_body = [poly for poly, g in zip(hpolys, hgroups) if g == "body"]
    body_verts = np.unique([v for poly in all_body for v, _ in poly]); HN0 = vertex_normals(H, all_body)
    # What the clothes hide. The garments name the skin they cover (delete_verts); on top of that, skin with cloth
    # right over it is found by casting along its normal. Skin is dropped where it lies well inside a garment (three
    # quads in from any opening, so nothing shows down a collar or up a sleeve); the covered skin that stays near the
    # openings is drawn in under the cloth, so it never pokes through a tight trouser leg.
    listed = np.zeros(len(H), dtype=bool); gap = np.full(len(H), np.inf)
    for c in worn:
        listed[c["delete"]] = True
        tris = tris_of(c)
        lo, hi = c["P"].min(0) - 0.6, c["P"].max(0) + 0.6
        near = body_verts[np.all((H[body_verts] >= lo) & (H[body_verts] <= hi), axis=1)]
        gap[near] = np.minimum(gap[near], ray_hits(H[near] - HN0[near] * 0.03, HN0[near], tris, 0.55) - 0.03)
    covered = np.isfinite(gap); depth = rings_from(all_body, len(H), ~covered)
    gone = listed | (depth >= 3)
    body_polys = [poly for poly in all_body if not all(gone[v] for v, _ in poly)]
    tuck = np.where(covered & (depth >= 1), np.clip(MIN_GAP - gap, 0, MIN_GAP) * np.where(depth >= 2, 1.0, 0.5), 0.0)
    HS = H - HN0 * tuck[:, None]  # the skin as drawn
    print(f"  body: {len(body_polys)} of {len(all_body)} quads kept; {int(covered[body_verts].sum())} skin vertices under cloth, {int((tuck > 0).sum())} drawn in")

    # --- scale to feet, soles on the floor ---
    lows = [H[[v for poly in all_body for v, _ in poly]][:, 1].min()] + [c["P"][:, 1].min() for c in worn]
    tops = H[[v for poly in all_body for v, _ in poly]][:, 1].max()
    floor = min(lows)
    scale = float(spec["height"]) / (tops - floor) if spec.get("height") else DM_TO_FT
    T = lambda P: (P - np.array([0.0, floor, 0.0])) * scale
    print(f"  height {(tops - floor) * 0.1:.3f} m as modelled, scaled to {(tops - floor) * scale:.2f} ft")

    g = Glb(); materials = {}; images = []; textures = []; meshes = []; nodes = []
    def texture(data, mime):
        images.append({"bufferView": g.view(data), "mimeType": mime})
        textures.append({"sampler": 0, "extensions": {"EXT_texture_webp": {"source": len(images) - 1}}} if mime == "image/webp" else {"source": len(images) - 1, "sampler": 0})
        return len(textures) - 1
    def material(key, color=(1, 1, 1), tex=None, rough=0.8, alpha=None, cutoff=0.5, double=False):
        """`key` identifies the material in this file; the part before any "#" is the name the runtime sees."""
        if key in materials: return list(materials).index(key)
        name = key.split("#")[0]
        m = {"name": name, "pbrMetallicRoughness": {"baseColorFactor": list(color) + [1], "metallicFactor": 0, "roughnessFactor": rough}}
        if tex is not None: m["pbrMetallicRoughness"]["baseColorTexture"] = {"index": tex}
        if alpha: m["alphaMode"] = alpha
        if alpha == "MASK": m["alphaCutoff"] = cutoff
        if double: m["doubleSided"] = True
        materials[key] = m; return len(materials) - 1
    def prim(arrs, mat):
        P, N, J, W, UV, I = arrs
        attrs = {"POSITION": g.acc(P, 5126, "VEC3", True, 34962), "NORMAL": g.acc(N, 5126, "VEC3", False, 34962), "TEXCOORD_0": g.acc(UV, 5126, "VEC2", False, 34962), "JOINTS_0": g.acc(J, 5123, "VEC4", False, 34962), "WEIGHTS_0": g.acc(W, 5126, "VEC4", False, 34962)}
        return {"attributes": attrs, "indices": g.acc(I, 5125, "SCALAR", False, 34963), "material": mat, "mode": 4}
    def add_mesh(name, prims):
        meshes.append({"name": name, "primitives": prims}); nodes.append({"name": name, "mesh": len(meshes) - 1, "skin": 0})

    colors = spec.get("colors", {})
    body_prims = []

    # skin: the texture divided by its own average tone, so the picked skin colour comes out as picked, with the lips,
    # cheeks and shading of the original on top
    HP = T(HS); HN = HN0; HJ, HW = top4(BW)
    skin = load_rgba(D(spec["skin"]), tex_size)[..., :3]
    lin = srgb2lin(skin); med = np.median(lin.reshape(-1, 3), axis=0)
    skin_tex = texture(*jpg_bytes(lin2srgb(np.clip(lin / med * float(spec.get("skinLevel", 0.86)), 0, 1)), 92))
    body_prims.append(prim(build_prim(HP, HN, HJ, HW, HVT, body_polys), material("skin", hex2lin(colors.get("skin", "#ffdfc4")), skin_tex, 0.62)))
    print(f"  skin: median tone {np.round(lin2srgb(med) * 255).astype(int).tolist()}")

    def proxy_arrays(px, polys=None):
        polys = px["polys"] if polys is None else polys
        N = vertex_normals(px["P"], px["polys"]); J, W = top4(px["BW"])
        return build_prim(T(px["P"]), N, J, W, px["VT"], polys)

    # clothes: one mesh may carry a top and trousers; they are told apart piece by piece (a piece whose middle sits
    # above the hips is the top) and share one shading map
    pelvis_y = joint_pos["joint-pelvis"][1]
    for c in worn:
        cs = c["spec"]; diffuse = c["tex"].get("diffuseTexture")
        size = int(cs.get("textureSize", tex_size))
        img = load_rgba(diffuse, size) if diffuse else np.ones((4, 4, 4))
        if "split" in cs:
            upper, lower = cs["split"]
            labels = components(c["polys"], len(c["P"]))
            cent = {}
            for lab, poly in zip(labels, c["polys"]): cent.setdefault(lab, []).extend(v for v, _ in poly)
            cut = pelvis_y + float(cs.get("splitAbove", 0.0))
            is_upper = {lab: c["P"][vs][:, 1].mean() > cut for lab, vs in cent.items()}
            groups = {upper: [p for lab, p in zip(labels, c["polys"]) if is_upper[lab]], lower: [p for lab, p in zip(labels, c["polys"]) if not is_upper[lab]]}
            masks = {k: uv_mask(v, c["VT"], img.shape[0], 3) for k, v in groups.items()}
            rgb = img[..., :3]
            if cs.get("plain", True):  # the top is a plain tee in the hall: no logo, piping or contrast bands
                rgb, odd = remove_print(rgb, masks[upper] & ~masks[lower], float(cs.get("printThreshold", 0.24)))
                print(f"  {c['rel']}: took {int(odd.sum())} printed texels off the top")
            shade = np.where(masks[lower][..., None] & ~masks[upper][..., None],
                             shade_map(rgb, masks[lower], float(cs.get("lowerRef", 85)), 0.95, float(cs.get("lowerGamma", 0.75)))[..., None],
                             shade_map(rgb, masks[upper], float(cs.get("upperRef", 90)), 0.97, float(cs.get("upperGamma", 1.0)))[..., None])
            t = texture(*jpg_bytes(np.repeat(shade, 3, axis=2), 90))
            for name, polys in groups.items():
                if not polys: continue
                body_prims.append(prim(proxy_arrays(c, polys), material(name, hex2lin(colors.get(name, "#888888")), t, 0.85)))
                print(f"  {c['rel']}: {name} {len(polys)} polygons")
        else:
            name = cs.get("material", "shoes")
            t = texture(*jpg_bytes(img, 90))
            body_prims.append(prim(proxy_arrays(c), material(name, (1, 1, 1), t, float(cs.get("rough", 0.6)))))
            print(f"  {c['rel']}: {name} {len(c['polys'])} polygons")

    # eyes and lashes ride with the head
    if spec.get("eyes"):
        # the eye maps are painted dim (their own renderer lights them up): lifted so the whites read as white
        e = proxy(spec["eyes"]["proxy"]); img = load_rgba(D(spec["eyes"]["texture"]), 256)
        img = lin2srgb(np.clip(srgb2lin(img[..., :3]) * float(spec["eyes"].get("gain", 1.9)), 0, 1))
        body_prims.append(prim(proxy_arrays(e), material("eye", (1, 1, 1), texture(*jpg_bytes(img, 92)), 0.25)))
    if spec.get("lashes"):
        e = proxy(spec["lashes"]); img = load_rgba(e["tex"]["diffuseTexture"], 256)
        img[..., :3] = 0.03
        body_prims.append(prim(proxy_arrays(e), material("lash", (1, 1, 1), texture(*webp_bytes(img)), 0.6, "BLEND", double=True)))
    add_mesh("body", body_prims)

    if spec.get("brows"):
        e = proxy(spec["brows"]); img = load_rgba(e["tex"]["diffuseTexture"], 256)
        img[..., :3] = 1.0  # white strokes: the hair colour multiplies in
        add_mesh("brows", [prim(proxy_arrays(e), material("brow", hex2lin(colors.get("hair", "#2b1b12")), texture(*webp_bytes(img)), 0.6, "BLEND"))])

    # hair: each style its own node (the runtime shows one), each with its own strand map
    for node, h in spec.get("hair", {}).items():
        hs = h if isinstance(h, dict) else {"proxy": h}
        e = proxy(hs["proxy"]); img = load_rgba(e["tex"]["diffuseTexture"], int(hs.get("textureSize", 512)))
        a = np.clip(blur(img[..., 3], 1.0), 0, 1); strands = a > 0.5  # a touch of blur: the cut-out edge is a smooth line, not texel steps
        shade = shade_map(img, strands if strands.any() else np.ones_like(a, dtype=bool), float(hs.get("ref", 80)), 0.95, float(hs.get("gamma", 0.6)))
        out = np.dstack([shade, shade, shade, a])
        # every style has its own strand map, so each gets its own material, all named "hair" for the runtime's recolouring
        m = material(f"hair#{node}", hex2lin(colors.get("hair", "#2b1b12")), texture(*webp_bytes(out)), 0.5, "MASK", float(hs.get("cutoff", 0.4)), True)
        add_mesh(node, [prim(proxy_arrays(e), m)])
        print(f"  {node}: {hs['proxy']} {len(e['polys'])} polygons")

    # --- skeleton: world-aligned joints, translations only ---
    heads = np.array([T(b["head"][None, :])[0] for b in bones])
    joint_nodes = []
    for i, b in enumerate(bones):
        local = heads[i] - (heads[b["parent"]] if b["parent"] >= 0 else np.zeros(3))
        joint_nodes.append({"name": b["name"], "translation": local.tolist(), "children": []})
    for i, b in enumerate(bones):
        if b["parent"] >= 0: joint_nodes[b["parent"]]["children"].append(i)
    for n in joint_nodes:
        if not n["children"]: del n["children"]
    ibm = np.tile(np.eye(4, dtype=np.float32), (nb, 1, 1))
    ibm[:, 3, :3] = -heads  # column-major storage: the translation sits in the last row of the row-major array
    skin_def = {"name": "Rig", "joints": list(range(nb)), "inverseBindMatrices": g.acc(ibm.reshape(-1, 16), 5126, "MAT4"), "skeleton": 0}
    root_i = next(i for i, b in enumerate(bones) if b["parent"] < 0)

    all_nodes = joint_nodes + nodes
    gltf = {"asset": {"version": "2.0", "generator": "forevercomiccon mh-to-glb"}, "scene": 0,
            "scenes": [{"name": "Scene", "nodes": [root_i] + list(range(nb, len(all_nodes)))}], "nodes": all_nodes, "meshes": meshes, "skins": [skin_def],
            "materials": list(materials.values()), "images": images, "textures": textures,
            "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
            "accessors": g.accessors, "bufferViews": g.views, "buffers": [{"byteLength": len(g.bin)}]}
    if any(im["mimeType"] == "image/webp" for im in images): gltf["extensionsUsed"] = ["EXT_texture_webp"]; gltf["extensionsRequired"] = ["EXT_texture_webp"]
    while len(g.bin) % 4: g.bin.append(0)
    gltf["buffers"][0]["byteLength"] = len(g.bin)
    js = json.dumps(gltf, separators=(",", ":")).encode()
    while len(js) % 4: js += b" "
    out = expand(spec["out"], base)
    with open(out, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(g.bin)))
        f.write(struct.pack("<II", len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack("<II", len(g.bin), 0x004E4942)); f.write(g.bin)
    verts = sum(g.accessors[p["attributes"]["POSITION"]]["count"] for m in meshes for p in m["primitives"])
    print(f"wrote {out} ({os.path.getsize(out) // 1024} KB, {verts} vertices, {nb} joints, {len(unweighted)} base vertices without weights)")


if __name__ == "__main__": main(sys.argv[1])
