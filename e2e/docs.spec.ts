/**
 * Docs pages: gateway links resolve, synced markdown really renders,
 * guide pages carry their runnable cell, prev/next pager walks the guide.
 */
import { test, expect } from '@playwright/test'

test('docs gateway links resolve', async ({ page }) => {
  await page.goto('/docs/', { waitUntil: 'networkidle' })
  for (const href of ['/docs/api-reference/', '/docs/migration/', '/docs/reference/models/', '/llms.txt', '/examples/']) {
    await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible()
  }
})

test('api reference renders the synced markdown', async ({ page }) => {
  await page.goto('/docs/api-reference/', { waitUntil: 'networkidle' })
  // Real content from the repo's docs/api-reference.md, not a stub
  await expect(page.locator('.prose h2').first()).toBeVisible()
  const codeBlocks = await page.locator('.prose pre').count()
  expect(codeBlocks, 'api reference carries code samples').toBeGreaterThan(5)
  const tables = await page.locator('.prose table').count()
  expect(tables, 'api reference carries tables').toBeGreaterThan(1)
})

test('migration guide renders', async ({ page }) => {
  await page.goto('/docs/migration/', { waitUntil: 'networkidle' })
  await expect(page.locator('.prose').first()).toBeVisible()
  expect(await page.locator('.prose pre').count()).toBeGreaterThan(2)
})

test('guide pager walks models → relationships', async ({ page }) => {
  await page.goto('/docs/reference/models/', { waitUntil: 'networkidle' })
  await page.locator('a', { hasText: 'Relationships →' }).click()
  await expect(page).toHaveURL(/\/docs\/reference\/relationships\//)
  await expect(page.locator('h1')).toContainText('Relationships')
  // and the sidebar marks it current
  await expect(page.locator('.side[aria-current="page"]')).toHaveText('Relationships')
})

test('guide "See it" cells carry the matching recipe', async ({ page }) => {
  await page.goto('/docs/reference/relationships/', { waitUntil: 'networkidle' })
  // Docs cells are static: the recipe's code plus the graph it creates
  const cell = page.locator('.pc[data-recipe="relationships"]')
  await expect(cell.locator('.pc-code')).toContainText('neode.relate(')
  await expect(cell.locator('svg[data-choreo-graph]')).toBeVisible()
})
