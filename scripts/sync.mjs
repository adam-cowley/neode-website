/**
 * Sync build inputs from the neode-ogm repository into the website:
 *   - examples/cookbook/*.ts   -> src/content/cookbook/  (recipe sources)
 *   - docs/api-reference.md    -> src/content/docs/      (full reference)
 *   - docs/migration-guide.md  -> src/content/docs/
 *   - llms.txt                 -> public/llms.txt
 * Idempotent; run before dev/build.
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const site = resolve(here, '..')
// The website lives beside the neode-ogm package in the workspace
const repo = resolve(site, '../neode-ogm')

const cookbookDest = join(site, 'src/content/cookbook')
const docsDest = join(site, 'src/content/docs')
mkdirSync(cookbookDest, { recursive: true })
mkdirSync(docsDest, { recursive: true })
mkdirSync(join(site, 'public'), { recursive: true })
mkdirSync(join(site, 'src/lib/generated'), { recursive: true })

// 1. Cookbook sources, byte-for-byte
const files = ['crud-collection.ts', 'relationships.ts', 'eager-read-models.ts', 'validation.ts', 'schema-sync.ts', 'search-fulltext-vector.ts', 'batch-and-transactions.ts', 'multi-database.ts', 'server-startup.ts']
for (const f of files) {
  const src = join(repo, 'examples/cookbook', f)
  if (!existsSync(src)) throw new Error(`cookbook missing: ${src}`)
  cpSync(src, join(cookbookDest, f))
}
console.log(`sync: ${files.length} cookbook recipes`)

// 2. Docs markdown — prepend frontmatter (the repo files have none, the
//    content loader needs a title) and strip the leading H1 (the page
//    supplies the heading; two h1s fail the a11y check)
for (const [f, title] of [['api-reference.md', 'API reference'], ['migration-guide.md', 'Migrating from 0.4.9']]) {
  const src = join(repo, 'docs', f)
  if (!existsSync(src)) throw new Error(`doc missing: ${src}`)
  let md = readFileSync(src, 'utf8')
  md = md.replace(/^# .+\n+/, '') // leading H1 belongs to the page, not the markdown
  if (!md.startsWith('---')) {
    md = `---\ntitle: ${title}\n---\n\n${md}`
  }
  writeFileSync(join(docsDest, f), md)
}
console.log('sync: api-reference.md, migration-guide.md')

// 3. llms.txt — synced into src (NOT public/: it is served through an Astro
//    endpoint so the response carries charset=utf-8; a bare public/ file
//    goes out as text/plain without charset and browsers render the UTF-8
//    punctuation as Latin-1 mojibake). Relative links are rewritten to the
//    repo, where those files actually live.
const llms = join(repo, 'llms.txt')
if (existsSync(llms)) {
  const GH = 'https://github.com/adam-cowley/neode/blob/main'
  const txt = readFileSync(llms, 'utf8')
    .replace(/\]\((?!http)([^)]+)\)/g, `](${GH}/$1)`)
    // fold to ASCII: static hosts serve .txt without a charset header, and
    // browsers that guess Latin-1 render UTF-8 punctuation as mojibake.
    // The file is for machines; ASCII is unambiguous everywhere.
    .replace(/[\u2014\u2013]/g, '--')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00a0/g, ' ')
  writeFileSync(join(site, 'src/lib/generated/llms.txt'), txt)
  console.log('sync: llms.txt (links rewritten to the repo, ASCII-folded)')
} else {
  console.warn('sync: llms.txt not found in repo, skipping')
}

// 4. Package version for the "runs version X" chip
const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'))
writeFileSync(join(site, 'src/lib/generated/version.json'), JSON.stringify({ version: pkg.version }))
console.log(`sync: neode version ${pkg.version}`)
