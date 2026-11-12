## Summary

Minimal docs update for neode NTS-659 — [`applySchemaDrift` gains an opt-in `returnDriftAfter: true` option](https://github.com/adam-cowley/neode/pull/326) that runs one post-apply inspection pass and returns `{ statements, driftAfter }`, so one probe serves apply + verification. Linear: https://linear.app/neo4j/issue/NTS-659

- `src/content/docs/api-reference.md` — the new compilable snippet and the updated `applySchemaDrift` bullet (hand-applied delta, byte-identical with the library's `docs/api-reference.md` at adam-cowley/neode#326; a full `pnpm sync` run at this point would drag in other in-review library docs, so only the NTS-659 lines were applied by hand).
- `src/components/DriftSteps.astro` — the apply step's card now mentions the `returnDriftAfter` re-probe.

`src/pages/index.astro`'s `installSchema() → schemaDrift() → applySchemaDrift()` flow stays as-is: the option is opt-in and that flow remains accurate.

## Testing

- `pnpm astro build` green locally (13 pages) — the same build CI runs; sync/verify are deliberately not part of CI (committed content).
- Diff is 2 files, +9/−2: no unrelated drift from sync (other sessions' in-review doc changes were reverted before applying the NTS-659 delta).

Cross-links: library PR adam-cowley/neode#326 · Linear [NTS-659](https://linear.app/neo4j/issue/NTS-659)

🤖 Generated with [OpenCode](https://opencode.ai)
