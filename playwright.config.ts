import { defineConfig, devices } from '@playwright/test'

// No @types/node in this project: read the environment without it.
const CI = Boolean((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI)

export default defineConfig({
  testDir: 'e2e',
  // Every worker runs a software (SwiftShader) WebGL context: more workers than this saturate the
  // CPU and make frame timing (camera glides, long presses) flaky.
  workers: CI ? 2 : 3,
  // Scenes are lazy chunks and the dev server transforms them on first use: allow for that under parallel load.
  expect: { timeout: 15_000 },
  // These need a production build: run by `npm run e2e:offline` (playwright.offline.config.ts).
  testIgnore: ['offline.spec.ts', '*.prod.spec.ts'],
  use: {
    baseURL: 'http://localhost:5173',
    // First-launch onboarding is off by default so specs reach the menu; its own spec turns it on.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:5173',
          localStorage: [
            { name: 'bricktown-onboarded-v2', value: '1' },
            { name: 'bricktown-install-hint-dismissed', value: '1' },
            // Fresh saves start with an empty city instead of the sample town (src/persistence/newSave.ts):
            // most specs build on an empty map. The sample town's own spec clears it.
            { name: 'bricktown-e2e-empty-city', value: '1' },
            // Music and sound effects off: nothing to hear in CI, and no 1.8 MB music decode per test.
            { name: 'bricktown-prefs', value: JSON.stringify({ state: { musicOn: false, sfxOn: false }, version: 0 }) },
          ],
        },
      ],
    },
  },
  projects: [{ name: 'tablet', use: { ...devices['iPad (gen 7) landscape'], browserName: 'chromium' } }],
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
})
