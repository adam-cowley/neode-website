/**
 * Home page interactions + theme toggle + a11y landmarks.
 */
import { test, expect } from '@playwright/test'

test('install command copies to the clipboard with feedback', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/', { waitUntil: 'networkidle' })

  await page.locator('[data-copy-install]').click()
  await expect(page.locator('[data-copy-label]')).toHaveText('copied ✓')

  const clip = await page.evaluate(() => navigator.clipboard.readText())
  expect(clip).toBe('npm install neode@next')
})

test('two-styles hover sync lights the matching schema-card row', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' })

  await page.locator('[data-style-field="age"]').first().hover()
  await expect(page.locator('[data-style-row="age"]')).toHaveCSS('box-shadow', /var?\(?--blue|rgb/)
  // and it clears on leave
  await page.locator('h2').first().hover()
  await expect(page.locator('[data-style-row="age"]')).toHaveCSS('box-shadow', /none|rgba\(0, 0, 0, 0\)/)
})

test('theme toggle switches to light, persists across reload', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.click('[data-theme-toggle]')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.click('[data-theme-toggle]')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('nav marks the current page and links every section', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  for (const href of ['/playground/', '/examples/', '/why-ogm/', '/agents/', '/docs/']) {
    await expect(page.locator(`nav a[href="${href}"]`).first()).toBeVisible()
  }
  await page.goto('/examples/', { waitUntil: 'networkidle' })
  await expect(page.locator('nav a[href="/examples/"]').first()).toHaveAttribute('aria-current', 'page')
})

test('skip link is the first focusable element', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.keyboard.press('Tab')
  await expect(page.locator('a[href="#main"]')).toBeFocused()
})
