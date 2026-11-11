# Avatar pipeline

The hall's visitor figures (`public/models/avatar-a.glb`, `avatar-b.glb`) are assembled from CC0 packs and this
project's own parts in four steps. Only the last two run day to day; the first two only when the bodies, hair styles or
animation set change. The two source packs are cloned **next to this repository** (or point `QUATERNIUS_STAGE` /
`KAYKIT_ADVENTURERS` at them):

```sh
GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://github.com/chibifire-stages/quaternius-stage ../chibifire-stages/quaternius-stage
GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 ../kaykit-game-assets/kaykit-character-pack-adventures-1.0
python3 -m venv .venv && .venv/bin/pip install usd-core numpy   # the USD reader for step 1
```

1. **Bodies** – `usd-to-glb.py body-a.json` / `body-b.json` → `models-src/body-{a,b}.glb`. Converts the Quaternius
   "Universal Base Characters" USD files (the male and female full bodies on a 65-joint UE-style rig, with the hair and
   eyebrow pieces) into a skinned glTF with textures: the body as `skin` (its colour map turned into a tintable
   luminance map, so the picker's skin tone multiplies onto the shading), `eye`, `brow`, five `hair_*` styles, and the
   clothes grown from the body itself (`clothes` in the spec): a `shirt`, `pants` and `shoes` cut from the body surface
   on clean planes (collar, sleeves, hem, ankle), smoothed, and pushed out along the normals, so they are seamless and
   deform with the body. The neckline is a ring round the neck (a crew neck), the hem stops at the hip bone, a loose
   shirt may sink part of its offset (`slack`) so muscle does not print through, and the female body is narrowed
   from the hip crest to the ankles (`slim`). The shoes are not shells (a shell keeps every toe): each is a built last,
   rounded cross-sections as wide and as high as the foot, skinned to the foot and ball bones, with the foot's own
   skin dropped inside it. The pack has four hair cuts (parted, long, buzzed, buns); `hair_curly` is grown the same way
   (`hair` in the spec): the scalp above a slanted hairline pushed out in a thick, bumpy shell with spherical UVs for
   the pack's hair texture. A hair or brow file whose bind pose differs from the body's (the pack's do, by a few
   centimetres) is rebound onto the body's joints, so every piece sits on this head. Y-up, feet, soles on y = 0, faces
   +z. The earlier stylised bodies ("Ultimate Animated Character", 32-joint rig) still convert with the same script.
2. **Clips** – `node retarget.mjs clips-a.json` / `clips-b.json` → `models-src/body-{a,b}.anim.glb`. Retargets
   walk/run/sit/cheer/bow/point from the KayKit Adventurers (any character file carries all 76 clips) and the
   project's own idle/wave/dance/clap/laugh/facepalm from `legacy-rig.glb` (the old procedural figure) onto the body's bones:
   world-space rotation deltas with limb-direction matching, eased elbows and knees, feet kept on the floor, the sit
   clip's hips pinned at seat height. The chibi sources carry their arms wide, which reads wrong on a human body, so
   the idle, walk and run clips take the `arms` option (`hang` / `swing`): the upper arm hangs straight from the
   shoulder, swings a capped fraction of the opposite leg's pitch, the elbow keeps a slight bend, and the hand stays at
   rest; the emotes keep the source arms, pulled in by the map's `inward` degrees.
3. **Assembly** – `npm run dev`, then `node scripts/export-models.mjs` (`/dev/models` in the browser): lifts the costume
   parts, badge and lanyard off the procedural figure in `src/lib/hall/modelkit/avatar.ts`, refits them onto the new
   head, torso and hand (`modelkit/assemble.ts`), bakes the far-crowd `lod` mesh, and writes `public/models/avatar-*.glb`
   with the manifest.
4. **Compression** – `node scripts/compress-models.mjs`: keyframe resampling, quantization, meshopt.

Everything the runtime relies on is a name: materials `skin hair brow shirt pants shoes belt eye costume costume2 cape
prop glow`, nodes `hair_*`, `cos_*`, `badge`, `lanyard_m`, `lod`, clips `idle walk run sit wave dance cheer clap bow
point laugh facepalm`. Licences: `public/models/LICENSES.md`.
