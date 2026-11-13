/**
 * Playground interactions: the choreography run, tabs, share/reset,
 * recipe switching, keyboard shortcut.
 */
import { test, expect } from '@playwright/test'

test('quickstart run: the created graph stays on screen', async ({ page }) => {
  await page.goto('/playground/', { waitUntil: 'networkidle' })

  // Before the run: the demo (seed) graph only — the Goodfellas cast
  await expect(page.locator('g[data-choreo-node]')).toHaveCount(7)
  await expect(page.locator('g[data-choreo-node]', { hasText: 'Goodfellas' })).toHaveCount(0)

  await page.getByRole('button', { name: /Run/ }).click()

  // Running the quickstart CREATES Goodfellas and relates Ray Liotta into
  // it — the created graph stays on screen
  await expect(page.locator('g[data-choreo-node]', { hasText: 'Goodfellas' })).toBeVisible()
  await expect(page.locator('g[data-choreo-node]')).toHaveCount(8)
  await expect(page.locator('svg[data-choreo-graph]')).toContainText('ACTED_IN')

  // Step counter advances and finishes (generous timeout: the run steps at
  // ~700ms each and parallel specs steal CPU)
  await expect(page.locator('[data-choreo-status]')).toContainText(/done — \d+ statements/u, { timeout: 30_000 })

  // Steps table has 8 rows; Cypher tab lists the captured statements
  await expect(page.locator('[data-choreo-steps] tr')).toHaveCount(8)
  await page.getByRole('tab', { name: 'Cypher' }).click()
  await expect(page.locator("[data-choreo-panel='cypher']").locator('> div > div')).toHaveCount(8)
  await expect(page.locator("[data-choreo-panel='cypher']")).toContainText("CREATE (this:Movie { title: $this_title })")

  // The eager read hydrated Ray Liotta as an actor of Goodfellas
  await expect(page.locator("[data-choreo-panel='cypher']")).toContainText('__EAGER')
})

test('relationships run: relate() draws the OWNS edge, detach() removes it', async ({ page }) => {
  await page.goto('/playground/?recipe=relationships', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Run/ }).click()

  // Both created nodes appear…
  await expect(page.locator('g[data-choreo-node]', { hasText: 'Adam' })).toBeVisible()
  await expect(page.locator('g[data-choreo-node]', { hasText: 'Rex' })).toBeVisible()

  // …the OWNS edge is drawn by relate()…
  await expect(page.locator('svg[data-choreo-graph]')).toContainText('OWNS', { timeout: 15_000 })

  // …removed by detach()…
  await expect(page.locator('svg[data-choreo-graph]')).not.toContainText('OWNS')

  // …drawn again by the second relate()…
  await expect(page.locator('svg[data-choreo-graph]')).toContainText('OWNS')

  // …and the final delete returns the graph to the seeded demo (7 nodes)
  await expect(page.locator('g[data-choreo-node]')).toHaveCount(7)
  await expect(page.locator('svg[data-choreo-graph]')).not.toContainText('OWNS')
})

test('validation recipe: the Validation tab shows the captured Zod failures', async ({ page }) => {
  await page.goto('/playground/?recipe=validation', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Run/ }).click()
  await page.getByRole('tab', { name: 'Validation' }).click()
  await expect(page.locator("[data-choreo-panel='validation']")).toContainText('Rejected: 3 failing checks')
  await expect(page.locator("[data-choreo-panel='validation']")).toContainText('"age" must be less than or equal to 150')
})

test('clicking a node shows its captured properties', async ({ page }) => {
  await page.goto('/playground/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Run/ }).click()
  await expect(page.locator('g[data-choreo-node]', { hasText: 'Ray Liotta' })).toBeVisible()
  await page.locator('g[data-choreo-node]', { hasText: 'Ray Liotta' }).click()
  await expect(page.locator('[data-choreo-props]')).toContainText(':Person')
  await expect(page.locator('[data-choreo-props]')).toContainText('Ray Liotta')
})

test('recipe select switches the editor and steps', async ({ page }) => {
  await page.goto('/playground/', { waitUntil: 'networkidle' })
  await page.evaluate(() => ((window as never as Record<string, number>).__marker = 42))
  await page.locator('select[data-choreo-select]').selectOption('schema-sync')
  await expect(page.locator('[data-choreo-editor]')).toHaveValue(/installSchema\(\)/)
  await expect(page.locator('[data-choreo-filename]')).toHaveText('schema-sync.ts')
  // in-place swap: the page must not reload (NTS — the select used to location.reload())
  await expect(page.locator('[data-choreo-editor]')).toHaveValue(/schemaDiff\(\)/)
  const marker = await page.evaluate(() => (window as never as Record<string, number>).__marker)
  expect(marker, 'page must not reload when switching recipes').toBe(42)
  await expect(page).toHaveURL(/recipe=schema-sync/)
})

test('⌘/Ctrl+Enter runs from the editor', async ({ page }) => {
  await page.goto('/playground/', { waitUntil: 'networkidle' })
  await page.locator('[data-choreo-editor]').focus()
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.locator('[data-choreo-status]')).toContainText('step', { timeout: 10_000 })
})

test('share writes the URL hash and reset restores the recipe source', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/playground/', { waitUntil: 'networkidle' })

  await page.getByRole('button', { name: 'Share' }).click()
  await expect(page).toHaveURL(/#recipe=quickstart&code=/)

  // Edit the code, then reset — the original recipe source comes back
  await page.locator('[data-choreo-editor]').fill('// my edit')
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(page.locator('[data-choreo-editor]')).toHaveValue(/Quickstart — the four-step tour/)
  await expect(page).not.toHaveURL(/#recipe=/)
})
