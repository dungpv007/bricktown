import { defineConfig, devices } from '@playwright/test'

const ORIGIN = 'http://localhost:4173'

// Runs against the production build (service worker + precache, no StrictMode), not the dev server:
// the offline check plus the production-only drive regression.
export default defineConfig({
  testDir: 'e2e',
  testMatch: ['offline.spec.ts', '*.prod.spec.ts'],
  use: {
    baseURL: ORIGIN,
    serviceWorkers: 'allow',
    storageState: {
      cookies: [],
      origins: [
        {
          origin: ORIGIN,
          localStorage: [
            { name: 'bricktown-onboarded', value: '1' },
            { name: 'bricktown-install-hint-dismissed', value: '1' },
          ],
        },
      ],
    },
  },
  projects: [{ name: 'tablet', use: { ...devices['iPad (gen 7) landscape'], browserName: 'chromium' } }],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: ORIGIN,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
