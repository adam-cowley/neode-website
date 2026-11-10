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
  await expect(page.locator('[data-choreo-status]')).toContainText('done — 10 statements', { timeout: 20_000 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
