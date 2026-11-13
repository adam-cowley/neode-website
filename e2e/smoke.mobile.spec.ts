/**
 * Mobile smoke: nav usable, playground panes stack, home hero fits.
 */
import { test, expect } from '@playwright/test'

test('mobile home renders and the hero is readable', async ({ page }, testInfo) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  await expect(page.locator('h1')).toBeVisible()
  // no horizontal overflow
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, 'horizontal scroll on mobile').toBeLessThanOrEqual(1)
  await page.screenshot({ path: `e2e/shots/home-mobile.png`, fullPage: true })
})

test('mobile playground: editor visible, run works', async ({ page }) => {
  await page.goto('/playground/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Run/ }).click()
  await expect(page.locator('[data-choreo-status]')).toContainText(/done — \d+ statements/u, { timeout: 20_000 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

test.describe('mobile layout at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  for (const path of ['/', '/examples/', '/why-ogm/', '/agents/', '/docs/', '/docs/reference/models/']) {
    test(`no horizontal overflow: ${path}`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' })
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(1)
    })
  }

  test('hamburger opens the main nav', async ({ page }) => {
    await page.goto('/docs/', { waitUntil: 'networkidle' })
    await expect(page.locator('#main-nav')).toBeHidden()
    await page.locator('[data-menu-toggle]').click()
    await expect(page.locator('#main-nav')).toBeVisible()
    await expect(page.locator('[data-menu-toggle]')).toHaveAttribute('aria-expanded', 'true')
  })

  test('playground tabs switch panes', async ({ page }) => {
    await page.goto('/playground/', { waitUntil: 'networkidle' })
    await expect(page.locator('.pg-editor')).toBeVisible()
    await page.locator('[data-pg-view=output]').click()
    await expect(page.locator('.pg-output')).toBeVisible()
    await expect(page.locator('.pg-editor')).toBeHidden()
  })
})
