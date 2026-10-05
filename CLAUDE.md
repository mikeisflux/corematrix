
## Booth furniture rules (do not get these wrong again)

- **Tables run long-ways along the open edge of the space**, parallel to the
  aisle the booth faces, like a real convention table. They never point into
  the booth. In code: `Table`/`TableFallback` and the empty-booth table box are
  long along local **z** at rotation 0, so a table on an edge that runs along
  **x** (an island's north/south side) needs `rotation.y = PI/2`, and a table on
  an edge that runs along **z** (every inline booth, an island's east/west side)
  needs rotation 0.
- **The roll-up banner stands centred behind its table, back against the
  drape/back wall**, facing the aisle. Never at the end of the table, never in
  front of it.
- After touching `Booth.tsx`, `EmptyBooths.tsx` or the table/banner props,
  capture `node scripts/dev/debug-booths.mjs` and look at the pictures before
  committing.
