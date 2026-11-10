/**
 * Build-time verification: run every cookbook recipe against a real Neo4j and
 * capture what neode actually did — statements (QUERY_EXECUTED), output,
 * timing. The site renders only verified results:
 *   - recipe "verified" chips
 *   - the playground choreography (captured statements per recipe)
 *   - the real generated Cypher shown on marketing pages
 *
 * Backend: a dedicated Docker container (neo4j:5-enterprise, falls back to
 * community) on port 7689 so the developer's own databases are never touched.
 * Data is wiped between recipes. multi-database additionally needs an
 * 'audit' database, which the harness creates on Enterprise.
 *
 * Emits: src/lib/generated/verify.json  — consumed by pages and playground.
 * Exits non-zero if any verifiable recipe fails (this is a build gate).
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const site = resolve(here, '..')
const repoDist = resolve(site, '../neode-ogm/dist/index.mjs')
const work = join(site, '.verify')
const out = join(site, 'src/lib/generated')
mkdirSync(work, { recursive: true })
mkdirSync(out, { recursive: true })

const NAME = 'neode-site-verify'
const PORT = 7689
const URI = `bolt://localhost:${PORT}`
const AUTH = { user: 'neo4j', password: 'verify-neode' }

const RECIPES = [
  'quickstart',
  'crud-collection',
  'relationships',
  'eager-read-models',
  'validation',
  'schema-sync',
  'search-fulltext-vector',
  'batch-and-transactions',
  'multi-database',
  'server-startup',
]

// ---------------------------------------------------------------- container
function docker(args) {
  return spawnSync('docker', args, { encoding: 'utf8' })
}

async function ensureContainer() {
  const ps = docker(['ps', '-a', '--filter', `name=${NAME}`, '--format', '{{.Status}}'])
  let enterprise = true
  const pull = docker(['pull', '-q', 'neo4j:5-enterprise'])
  if (pull.status !== 0) enterprise = false
  const image = enterprise ? 'neo4j:5-enterprise' : 'neo4j:5'
  const env = enterprise ? ['-e', 'NEO4J_ACCEPT_LICENSE_AGREEMENT=yes'] : []
  if (ps.status !== 0 || !ps.stdout.trim()) {
    const run = docker([
      'run', '-d', '--name', NAME, '-p', `${PORT}:7687`,
      '-e', `NEO4J_AUTH=${AUTH.user}/${AUTH.password}`,
      ...env,
      image,
    ])
    if (run.status !== 0) throw new Error(`docker run failed: ${run.stderr}`)
    console.log(`verify: started ${image} on :${PORT}`)
  } else {
    docker(['start', NAME])
    console.log(`verify: reused container ${NAME} (${ps.stdout.trim()})`)
  }
  return { enterprise }
}

// ------------------------------------------------------------------ driver
const neo4j = (await import('neo4j-driver')).default
const driver = neo4j.driver(URI, neo4j.auth.basic(AUTH.user, AUTH.password))

async function waitReachable() {
  for (let i = 0; i < 60; i++) {
    try {
      await driver.getServerInfo()
      return
    } catch {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  throw new Error('Neo4j container did not become reachable in 60s')
}

async function wipeData() {
  const session = driver.session()
  try {
    await session.run('MATCH (n) DETACH DELETE n')
  } finally {
    await session.close()
  }
}

async function createAuditDatabase() {
  const session = driver.session({ database: 'system' })
  try {
    await session.run('CREATE DATABASE audit IF NOT EXISTS')
    return true
  } catch (error) {
    console.warn(`verify: no 'audit' database (${error.message.split('\n')[0]})`)
    return false
  } finally {
    await session.close()
  }
}

// ------------------------------------------------------------------- shim
// Aliased over 'neode' inside each bundled recipe: identical API, except
// fromEnv() attaches a QUERY_EXECUTED capture to the instance it returns.
function shimSource(captureFile) {
  return `
import { appendFileSync, mkdirSync } from 'node:fs'
import * as real from ${JSON.stringify(repoDist)}
export * from ${JSON.stringify(repoDist)}
const __write = (line) => {
  mkdirSync(${JSON.stringify(work)}, { recursive: true })
  appendFileSync(${JSON.stringify(captureFile)}, JSON.stringify(line) + '\\n')
}
export const fromEnv = (...args) => {
  const inst = real.fromEnv(...args)
  inst.on(real.EventType.QUERY_EXECUTED, (e) =>
    __write({ kind: 'query', cypher: e.cypher, params: e.params ?? {}, duration: e.duration }))
  return inst
}
`
}

// ------------------------------------------------------------------ runner
function runRecipe(recipe, captureFile) {
  return new Promise((resolveRun) => {
    const started = Date.now()
    const child = spawn(process.execPath, [join(work, `${recipe}.mjs`)], {
      env: {
        ...process.env,
        NEO4J_URI: URI,
        NEO4J_USERNAME: AUTH.user,
        NEO4J_PASSWORD: AUTH.password,
        NEO4J_DATABASE: 'neo4j',
        PORT: '3111',
      },
    })
    let outText = ''
    let errText = ''
    child.stdout.on('data', (d) => (outText += d))
    child.stderr.on('data', (d) => (errText += d))

    const timeout = setTimeout(() => child.kill('SIGTERM'), 60_000)

    // server-startup keeps running until told to stop: probe it, then shut down
    if (recipe === 'server-startup') {
      const port = Number(process.env.PORT || 3111)
      const probe = setInterval(async () => {
        if (!outText.includes(`listening on :${port}`)) return
        clearInterval(probe)
        try {
          const res = await fetch(`http://localhost:${port}`)
          outText += `\nGET / -> ${res.status} ${(await res.text()).trim()}`
        } catch (e) {
          errText += `\nprobe failed: ${e.message}`
        }
        child.kill('SIGTERM')
      }, 250)
    }

    child.on('exit', (code) => {
      clearTimeout(timeout)
      resolveRun({ code: code ?? -1, output: outText.trim(), error: errText.trim(), ms: Date.now() - started })
    })
  })
}

// -------------------------------------------------------------- per recipe
async function verifyRecipe(recipe, meta) {
  const captureFile = join(work, `${recipe}.jsonl`)
  rmSync(captureFile, { force: true })

  const shimFile = join(work, `shim-${recipe}.mjs`)
  writeFileSync(shimFile, shimSource(captureFile))

  await build({
    entryPoints: [join(site, 'src/content/cookbook', `${recipe}.ts`)],
    outfile: join(work, `${recipe}.mjs`),
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    alias: { neode: shimFile },
    // Fully bundled; the banner gives esbuild's CJS interop a real require
    // so packages that dynamically require (neo4j-driver, dotenv) keep working
    banner: {
      js: "import { createRequire as __cjs } from 'node:module'; const require = __cjs(import.meta.url);",
    },
    logLevel: 'silent',
  })

  if (meta.needsWipe) await wipeData()
  const result = await runRecipe(recipe, captureFile)

  let statements = []
  if (existsSync(captureFile)) {
    statements = readFileSync(captureFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .filter((e) => e.kind === 'query')
      .map((e) => ({ cypher: e.cypher, params: e.params ?? {}, duration: e.duration }))
  }
  return { ...result, statements }
}

// ------------------------------------------------------------------- main
const { enterprise } = await ensureContainer()
await waitReachable()

const meta = {
  quickstart: { needsWipe: true },
  'crud-collection': { needsWipe: true },
  relationships: { needsWipe: true },
  'eager-read-models': { needsWipe: true },
  validation: { needsWipe: true },
  'schema-sync': { needsWipe: true },
  'search-fulltext-vector': { needsWipe: true },
  'batch-and-transactions': { needsWipe: true },
  'multi-database': { needsWipe: true },
  'server-startup': { needsWipe: false },
}

if (enterprise) meta['multi-database'].auditOk = await createAuditDatabase()

const results = {}
let failed = 0
for (const recipe of RECIPES) {
  process.stdout.write(`verify: ${recipe} ... `)
  const r = await verifyRecipe(recipe, meta[recipe])
  const ok = r.code === 0
  if (!ok) failed++
  console.log(ok ? `ok (${r.ms} ms, ${r.statements.length} statements)` : `FAILED (exit ${r.code})`)
  if (!ok && r.error) console.log(`  -> ${r.error.split('\n').slice(0, 4).join('\n  ')}`)
  results[recipe] = {
    ok,
    ms: r.ms,
    output: r.output,
    error: r.error,
    statements: r.statements,
    auditOk: meta[recipe].auditOk,
  }
}

// Real ontology sample output for the AI page: register a Northwind-shaped
// model set and emit the live schema document (map API — plain Node can't
// parse decorators)
{
  process.stdout.write('verify: ontology sample ... ')
  const { defineModel, ontologyMarkdown } = await import(repoDist)

  defineModel('Customer', {
    description: 'A company or person that buys products',
    customerID: { type: 'string', unique: true, primary: true, description: 'Natural key from the source system' },
    companyName: { type: 'string', required: true, description: 'Trading name shown on invoices' },
    contactName: { type: 'string', description: 'Who to call about an order' },
    country: { type: 'string', description: 'Two-letter ISO country the customer ships to' },
    ORDERS: {
      type: 'relationships',
      relationship: 'PURCHASED',
      direction: 'out',
      target: 'Order',
      description: 'Every order this customer has placed, newest first when read',
    },
  })

  defineModel('Order', {
    description: 'One purchase: an employee handled it, it contains products',
    orderID: { type: 'string', unique: true, primary: true },
    orderDate: { type: 'date', description: 'The day the customer placed the order' },
    requiredDate: { type: 'date' },
    shippedDate: { type: 'date', description: 'Empty until the warehouse ships' },
    freight: { type: 'float' },
    PRODUCTS: {
      type: 'relationships',
      relationship: 'CONTAINS',
      direction: 'out',
      target: 'Product',
      description: 'Line items: the products on this order',
    },
    EMPLOYEE: {
      type: 'relationship',
      relationship: 'HANDLED_BY',
      direction: 'out',
      target: 'Employee',
      description: 'The salesperson who took the order',
    },
  })

  defineModel('Product', {
    description: 'A product the company stocks and sells',
    productID: { type: 'string', unique: true, primary: true },
    productName: { type: 'string', required: true },
    unitPrice: { type: 'float', description: 'Current list price, per unit' },
    unitsInStock: { type: 'int', description: 'Warehouse stock on hand; 0 means back-ordered' },
    discontinued: { type: 'boolean', description: 'True once the product is withdrawn — exclude from new orders' },
    CATEGORY: {
      type: 'relationship',
      relationship: 'PART_OF',
      direction: 'out',
      target: 'Category',
      description: 'Exactly one category groups each product',
    },
    SUPPLIER: {
      type: 'relationship',
      relationship: 'SUPPLIED_BY',
      direction: 'out',
      target: 'Supplier',
      description: 'The vendor the product is sourced from',
    },
  })

  defineModel('Category', {
    description: 'Groups products for browsing and reporting',
    categoryID: { type: 'string', unique: true, primary: true },
    categoryName: { type: 'string', required: true },
  })

  defineModel('Supplier', {
    description: 'The vendor a product is sourced from',
    supplierID: { type: 'string', unique: true, primary: true },
    companyName: { type: 'string', required: true },
    country: { type: 'string' },
  })

  defineModel('Employee', {
    description: 'A salesperson who takes orders; reports to another employee',
    employeeID: { type: 'string', unique: true, primary: true },
    firstName: { type: 'string', required: true },
    lastName: { type: 'string', required: true },
    title: { type: 'string' },
    hireDate: { type: 'date' },
    REPORTS_TO: {
      type: 'relationship',
      relationship: 'REPORTS_TO',
      direction: 'out',
      target: 'Employee',
      description: 'The managing employee — self-referencing, the org chart is a hierarchy',
    },
  })

  const sample = ontologyMarkdown()
  results['ontology-sample'] = { ok: sample.length > 0, output: sample }
  console.log('ok')
}

const summary = {
  verifiedAt: new Date().toISOString(),
  backend: `${enterprise ? 'Neo4j 5 Enterprise' : 'Neo4j 5 Community'} (Docker, :${PORT})`,
  neo4jVersion: (await driver.getServerInfo()).agent,
  results,
}
writeFileSync(join(out, 'verify.json'), JSON.stringify(summary, null, 2))
console.log(`verify: wrote src/lib/generated/verify.json — ${failed} failure(s)`)

await driver.close()
process.exit(failed > 0 ? 1 : 0)
