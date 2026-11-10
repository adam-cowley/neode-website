/**
 * Every page, one smoke test each: HTTP 200, expected title, expected
 * landmark content, zero console errors, zero page errors. Also captures
 * a full-page screenshot per page into e2e/shots/ — the input for the
 * design review.
 */
import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const SHOTS = 'e2e/shots'
mkdirSync(SHOTS, { recursive: true })

interface PageSpec {
  path: string
  title: string
  mustContain: string[]
}

const PAGES: PageSpec[] = [
  { path: '/', title: 'neode — Define your graph in TypeScript', mustContain: ['Define your graph in TypeScript', 'Same code. Bring your own engine.', 'Honest caveats.', 'From install to first query in four steps.'] },
  { path: '/playground/', title: 'neode — Playground', mustContain: ['Goodfellas graph · seeded on boot', 'playback · verified Neo4j run', 'Result', 'Validation'] },
  { path: '/examples/', title: 'neode — Examples', mustContain: ['Nine runnable recipes', 'Open in playground', 'verified'] },
  { path: '/why-ogm/', title: 'neode — Why an OGM?', mustContain: ['Create one person.', 'One query per read.', 'Errors you can switch on.', 'A migration workflow'] },
  { path: '/agents/', title: 'neode — AI and Agents', mustContain: ['Ground Text2Cypher in the live schema', 'Text2Cypher grounding', 'MCP resources', 'llms.txt'] },
  { path: '/docs/', title: 'neode — Docs', mustContain: ['Start with the guide. Keep the API reference open.', 'API reference', 'Migrating from 0.4.9'] },
  { path: '/docs/api-reference/', title: 'neode — API reference', mustContain: ['API reference'] },
  { path: '/docs/migration/', title: 'neode — Migrating from 0.4.9', mustContain: ['Migrating from 0.4.9'] },
  { path: '/docs/reference/models/', title: 'neode — Defining models', mustContain: ['Decorators', 'Map API', 'Try it'] },
  { path: '/docs/reference/relationships/', title: 'neode — Relationships', mustContain: ['Eager loading', 'Read models', 'Try it'] },
  { path: '/docs/reference/traversals/', title: 'neode — Traversals', mustContain: ['Hops', 'Try it'] },
  { path: '/docs/reference/search/', title: 'neode — Vector and full-text search', mustContain: ['Vector search', 'Full-text search', 'Try it'] },
]

async function watchConsole(page: Page): Promise<string[]> {
  const problems: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console.error: ${m.text()}`)
  })
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  return problems
}

for (const spec of PAGES) {
  test(`page ${spec.path}`, async ({ page }) => {
    const problems = await watchConsole(page)
    const response = await page.goto(spec.path, { waitUntil: 'networkidle' })
    expect(response?.status(), `${spec.path} should return 200`).toBe(200)

    await expect(page).toHaveTitle(spec.title)

    for (const text of spec.mustContain) {
      // visible-only: the playground's recipe <select> hides option texts
      await expect(page.getByText(text).locator('visible=true').first()).toBeVisible()
    }

    // One and only one h1 per page
    expect(await page.locator('h1').count(), `${spec.path} h1 count`).toBe(1)

    expect(problems, `${spec.path} console/page errors`).toEqual([])

    const shot = `${SHOTS}/${spec.path === '/' ? 'home' : spec.path.replaceAll('/', '_').replace(/^_|_$/g, '')}-desktop.png`
    await page.screenshot({ path: shot, fullPage: true })
  })
}

test('404 page', async ({ page }) => {
  const problems = await watchConsole(page)
  const response = await page.goto('/this-page-was-detached/', { waitUntil: 'networkidle' })
  expect(response?.status()).toBe(404)
  await expect(page.getByText('This page has been DETACH DELETEd.')).toBeVisible()
  // The navigation itself logging "404 (Not Found)" is expected; anything else is not
  const unexpected = problems.filter((p) => !p.includes('404 (Not Found)'))
  expect(unexpected).toEqual([])
  await page.screenshot({ path: `${SHOTS}/404-desktop.png`, fullPage: true })
})

test('llms.txt ships', async ({ request }) => {
  const res = await request.get('/llms.txt')
  expect(res.status()).toBe(200)
  expect(await res.text()).not.toBe('')
})
