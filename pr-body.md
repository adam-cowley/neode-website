Mirrors the neode library PR: https://github.com/adam-cowley/neode/pull/322

## What

Adds `whereNotPattern` to the migration guide's Builder predicate list — the negative pattern predicate (`WHERE NOT (alias)<-[:TYPE]-()`, "node with no such relationship") added to the Builder in neode NTS-657. One line, synced from the library's `docs/migration-guide.md` (`scripts/sync.mjs` with `NEODE_REPO` pointed at the library PR's worktree).

## Testing

Content-only change; site CI does not re-run sync (synced content is committed). `astro build` compiles the committed markdown — no behavioural surface touched. Synced diff reviewed to carry only the NTS-657 line.
