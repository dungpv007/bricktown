import { defineConfig, devices } from '@playwright/test'

// No @types/node in this project: read the environment without it.
const CI = Boolean((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI)

// Its own dev server, never the one a developer keeps running on 5173: a long-lived server can serve a stale
// module graph after branch merges, and sharing Vite's dependency cache between two servers breaks it.
const PORT = 5180
const ORIGIN = `http://localhost:${PORT}`

export default defineConfig({
  testDir: 'e2e',
  // Every worker runs a software (SwiftShader) WebGL context that can take most of the CPU on its own:
  // one worker locally keeps the machine usable (and frame timing steady).
  workers: CI ? 2 : 1,
  // Scenes are lazy chunks and the dev server transforms them on first use: allow for that under parallel load.
  expect: { timeout: 15_000 },
  // These need a production build: run by `npm run e2e:offline` (playwright.offline.config.ts).
  testIgnore: ['offline.spec.ts', '*.prod.spec.ts'],
  use: {
    baseURL: ORIGIN,
    // First-launch onboarding is off by default so specs reach the menu; its own spec turns it on.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: ORIGIN,
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
  // deviceScaleFactor 1: the iPad preset's 2x renders four times the pixels in software WebGL for nothing
  // the specs check (layout is measured in CSS pixels).
  projects: [{ name: 'tablet', use: { ...devices['iPad (gen 7) landscape'], deviceScaleFactor: 1, browserName: 'chromium' } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: ORIGIN,
    reuseExistingServer: false,
    env: { BT_VITE_CACHE_DIR: 'node_modules/.vite-e2e' },
  },
})
