# Avatar pipeline

The hall's visitor figures (`public/models/avatar-a.glb`, `avatar-b.glb`) are realistic adults built from CC0 assets
and real motion capture in four steps. Only the last two run day to day; the first two only when the bodies, clothes,
hair styles or animation set change. The source checkouts sit **next to this repository** (or point the environment
variables at them):

```sh
# MakeHuman's data folder with its assets: base mesh, targets, skins, clothes, hair, eyes (MAKEHUMAN_DATA)
git clone --depth 1 https://github.com/vidya-hub/makehuman-core ../vidya-hub/makehuman-core
# MPFB2: the game-engine rig and its vertex weights (MPFB_DATA = …/src/mpfb/data)
git clone --depth 1 https://github.com/makehumancommunity/mpfb2 ../makehumancommunity/mpfb2
# the CMU motion-capture database as BVH (CMU_MOCAP = …/data); only the subjects named in clips-*.json are needed
git clone --depth 1 --filter=blob:none --sparse https://github.com/una-dinosauria/cmu-mocap ../una-dinosauria/cmu-mocap
git -C ../una-dinosauria/cmu-mocap sparse-checkout set data/014 data/016 data/035 data/075 data/079 data/080 data/113 data/137 data/141 data/143
python3 -m venv .venv && .venv/bin/pip install numpy pillow   # step 1
```

MakeHuman's own repository keeps its textures in Git LFS; any copy of its `data` folder with the textures as plain
files works (`vidya-hub/makehuman-core` is one).

1. **Bodies** – `python3 mh-to-glb.py body-a.json` / `body-b.json` → `models-src/body-{a,b}.glb`. Applies the macro
   targets that turn MakeHuman's base mesh into an adult man or woman, places the 53-joint game rig on it (Unreal-style
   names) with MPFB2's weights, and fits the worn assets: MakeHuman binds every clothes, shoe, hair, eye, brow and lash
   vertex to three base-mesh vertices, so each piece follows the body's shape and takes its skin weights from the same
   three vertices. Skin hidden by a garment is dropped (what the garment lists, plus anything three quads inside an
   opening, found by casting along the skin's normals), the covered skin that stays near the openings is drawn in under
   the cloth, and a garment under another garment (socks under trouser legs) is trimmed and tucked the same way, so
   nothing pokes through. The figure is scaled to the spec's `height` in feet with the soles on y = 0, facing +z.
   Textures the visitor recolours become neutral shading maps the picked colour multiplies onto: the skin map divided
   by its own median tone (`skinLevel` sets how bright), the outfit's top with everything printed on it removed (logo,
   piping, contrast bands: `remove_print`) and its trousers as denim shading, each hair style as a strand map with a
   smoothed cut-out. Eyes are lifted so the whites read white. One clothes asset may hold a top and trousers: `split`
   tells them apart piece by piece (a piece whose middle is above the hips is the top). Hair styles are named by the
   node the runtime shows (`hair_short`, `hair_long`, `hair_buzz`, `hair_bun`, `hair_curly`): men's cuts on body a,
   women's on body b (the labels are `HAIR_NAMES` in `src/lib/hall/store.ts`). Every joint is world-aligned at rest;
   the rest pose is MakeHuman's (arms out and down, forearms forward).
2. **Clips** – `node retarget.mjs clips-a.json` / `clips-b.json` → `models-src/body-{a,b}.anim.glb`. Every clip is a
   stretch of a real performance from the CMU database (`probe.mjs` lists a take's clean strides and its calmest
   standing windows): for each mapped bone the performer's world rotation, as a turn away from the take's reference
   T-pose, is applied to our bone after a one-off correction that lays our limb along theirs with the elbow or knee
   axis matched, so the two skeletons may rest in different poses and differ in build. Travel is scaled by leg length
   and the body set down each frame so the lowest heel, ball or toe is as far above the floor as the performer's.
   - `stroll`, `walk` and `run`: one stride each (an easy stroll, a brisk walk, a jog) from left foot strike to left
     foot strike, its steady advance removed and its ends eased together (`loop`, `travel: "trend"`). The script
     prints the ground speed each covers on this body. The hall mixes stroll and walk by how fast a figure moves.
   - `idle`: a calm stretch of standing played there and back with eased turns (`loop: "sway"`), spine and head
     read from an upright moment (`calibrate`). Its first frame is the `neutral` pose the gestures blend from and to.
   - gestures (`wave clap cheer bow point laugh facepalm dance`): cut from pantomime takes with `intro` / `outro`
     blends; `upper` ones play only above the hips so the feet cannot slide. `fingers` sets the hand shape (the
     captures record none): open to wave, a pointing index finger, relaxed otherwise.
   - `sit`: a seated stretch with the hips pinned at the hall's chair height (`hipsY`), the legs re-aimed so the feet
     rest flat on the floor, the knees brought in (`knees`) and the hands laid on the thighs (`handsOn`).
   Clips from a glTF library also work (`ual_mh` maps Quaternius's Universal Animation Library); none is used now.
3. **Assembly** – `npm run dev`, then `node scripts/export-models.mjs` (`/dev/models` in the browser): lifts the costume
   parts off the procedural figure in `src/lib/hall/modelkit/avatar.ts` and refits them onto this body
   (`modelkit/assemble.ts`): head pieces vertex by vertex (masks, visors and cowls across the eyes, the crown on the
   crown, eye openings cut in the mask); what lies on the chest (emblems, tie, shirt front, scarf ends, pack straps)
   laid on the body's front; what goes round the torso (belt, robe, chest plate) fitted to the body's outline at each
   height; the belt handed to the hips; the robe skinned to the hips and legs so it swings with a stride and folds
   over a seated lap; carried props into the hand. The badge and
   lanyard are made for the body: a cord on the shirt's collar round the back of the neck, taut down the chest to a
   badge of about two business cards. It then bakes the far-crowd `lod` mesh and writes `public/models/avatar-*.glb`
   with the manifest.
4. **Compression** – `node scripts/compress-models.mjs`: the far-crowd mesh simplified to a few thousand triangles,
   keyframe resampling, textures to WebP, quantization, meshopt.

When the stroll, walk or run clip changes, copy the printed ground speeds into `CLIP_PACE` in
`src/components/hall/models.tsx`: the hall plays each cycle at the figure's real speed over that pace, so feet do not
slide. When a body's height changes, check the name tag and marker heights in `src/components/hall/Avatar.tsx`.

Everything the runtime relies on is a name: materials `skin hair brow shirt pants shoes eye lash costume costume2 cape
prop glow`, nodes `hair_*`, `cos_*`, `badge`, `lanyard_m`, `lod`, joints `pelvis spine_01 spine_03 neck_01 Head
upperarm_l lowerarm_l hand_l thigh_l calf_l foot_l` (and `_r`), clips `idle stroll walk run sit wave dance cheer
clap bow point laugh facepalm`. Licences: `public/models/LICENSES.md`.
