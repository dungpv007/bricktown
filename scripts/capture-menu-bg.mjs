// Captures public/menu-bg.webp, the main menu's instant poster, from the live 3D town behind it
// (src/scenes/menuBg), so the poster and the town it fades into match.
//
//   npm run dev                                   (in another terminal)
//   node scripts/capture-menu-bg.mjs [baseURL]    (default http://localhost:5173)
//
// Rerun it whenever the town (diorama.ts, the templates it shows, materials) changes.
/* global process, localStorage, window, navigator -- Node script; the init script below runs in the page */
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import sharp from 'sharp'

const BASE_URL = process.argv[2] ?? 'http://localhost:5173'
const OUT = fileURLToPath(new URL('../public/menu-bg.webp', import.meta.url))
const WIDTH = 1600
const HEIGHT = 1000
/** Rendered larger, then scaled down: smoother edges than the canvas's own antialiasing. */
const SUPERSAMPLE = 1.25
const MAX_BYTES = 200 * 1024

const browser = await chromium.launch()
try {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: SUPERSAMPLE,
    reducedMotion: 'no-preference',
  })
  await context.addInitScript(() => {
    // Straight to the menu (no first-launch tour or install tip), and the town holds its opening pose.
    localStorage.setItem('bricktown-onboarded-v2', '1')
    localStorage.setItem('bricktown-install-hint-dismissed', '1')
    window.__btMenuBgStill = true
    // The town only plays on capable devices: look like one whatever machine runs the capture.
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })
  })
  const page = await context.newPage()
  await page.goto(BASE_URL)
  await page.getByTestId('menu-bg-live').and(page.locator('[data-ready="true"]')).waitFor({ timeout: 60_000 })
  // Only the town: hide the menu, the poster under the town and the readability shade.
  await page.addStyleTag({
    content: `.bt-menu > :not(.bt-menu-bg), .bt-menu-bg-poster, .bt-menu-bg-shade { visibility: hidden !important; }
      .bt-menu-bg-live { transition: none !important; }`,
  })
  await page.waitForTimeout(500)
  const png = await page.screenshot({ type: 'png' })

  let quality = 80
  let webp
  for (;;) {
    webp = await sharp(png).resize(WIDTH, HEIGHT).webp({ quality, effort: 6 }).toBuffer()
    if (webp.length <= MAX_BYTES || quality <= 40) break
    quality -= 5
  }
  if (webp.length > MAX_BYTES) throw new Error(`poster is ${webp.length} bytes even at quality ${quality}`)
  await writeFile(OUT, webp)
  console.log(`wrote ${OUT}: ${WIDTH}x${HEIGHT}, ${Math.round(webp.length / 1024)} KB (quality ${quality})`)
} finally {
  await browser.close()
}
