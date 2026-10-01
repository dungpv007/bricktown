import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:5173' },
  projects: [{ name: 'tablet', use: { ...devices['iPad (gen 7) landscape'], browserName: 'chromium' } }],
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
})
