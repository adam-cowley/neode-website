import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // CI-grade: fail fast on console errors, keep output tight
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4321',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { ...devices['iPhone 14'] },
      testMatch: /.*\.mobile\.spec\.ts/,
    },
  ],
  // Tests run against the BUILT site (the same artifact that ships)
  webServer: {
    command: 'pnpm astro preview --port 4321',
    url: 'http://localhost:4321',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
