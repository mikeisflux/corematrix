
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

## Site documentation stays current (do not skip this)

- The user-facing documentation lives in **one place**, `src/lib/docs.ts` (structured sections: title, slug,
  summary, steps, tips), and is rendered by both the public docs pages under `/help` and the in-hall **Help** panel.
  Both views read the same data, so a change there updates everywhere.
- **Whenever a feature of the app is added, changed or removed** (a panel, a control, a key, a booth/dashboard
  capability, a quest, a coin rule, an admin tool, a URL parameter, a limit or a price), update the matching section in
  `src/lib/docs.ts` in the same commit, or add a new section if none fits. A feature is not done until its
  documentation says how to use it.
- Write the docs for a visitor or an exhibitor, not a developer: what it is, where to find it, how to use it, what it
  costs, and any limits. Keep the key/control tables accurate (walk keys, emote keys, deep links).
