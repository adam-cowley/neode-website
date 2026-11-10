# neode website

The marketing site + in-browser playground for [neode](../neode-ogm) — a TypeScript OGM for Neo4j.

## Commands

```sh
pnpm dev        # dev server (uses the last captured verify results)
pnpm sync       # copy cookbook sources + docs + llms.txt from the repo
pnpm verify     # run every cookbook recipe against a real Neo4j, capture statements
pnpm build      # sync + verify + astro build (the verify step is the build gate)
pnpm preview    # serve the built site
```

## How the playground works

The playground is a **choreographed replay**: `scripts/verify.mjs` runs every cookbook
recipe in `../neode-ogm/examples/cookbook/` against a real Neo4j (a dedicated Docker
container, `neode-site-verify` on port 7689 — never your dev databases), capturing every
statement through neode's own `QUERY_EXECUTED` event. The site replays those captured
statements: the graph animates, the Cypher inspector streams the real generated
statements, the validation tab shows the real captured failures.

Honesty rules baked in:
- Every code snippet on the site is byte-identical to the repo (synced at build time).
- Every captured statement is a real `QUERY_EXECUTED` event from the verified run.
- The verify step **fails the build** if any recipe fails — the green chips are earned.

## Layout

- `src/pages/` — one page per design screen (home, playground, examples, why-ogm, agents, docs, 404)
- `src/components/` — all sections and the playground islands (`.astro`, reusable)
- `src/scripts/choreograph.ts` — the playback engine (vanilla TS, no framework)
- `src/content/cookbook/` — synced recipe sources (quickstart is the README tour, runnable)
- `src/content/docs/` — synced `api-reference.md` + `migration-guide.md`
- `src/lib/generated/verify.json` — the build's verification evidence

## Design

Ported from the approved design file (`neode — website.html`): JetBrains Mono
site-wide, dark default + light theme (toggle in the nav, persisted to localStorage),
`--blue`/`--amber` node palette, clause-chip section headers. Reduced-motion honoured.
