// npm run bt:preview -- <in.json | file.bricktown | file.link.txt | link> [--url <app url>] [--out <dir>] [--angles 1-4]
//
// Renders a BrickTown creation for comparing with the photo it was made from: opens the running app
// (dev or preview server) with the share link, screenshots the import preview, confirms the import,
// then screenshots the model in the Workshop from several camera angles (or the city / maze).
// Exit code 0 = screenshots written, 1 = the app refused the creation, 2 = usage / server problem.
import { chromium, type Page } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { DEFAULT_BASE, pack } from './lib/pack'

const USAGE = `usage: npm run bt:preview -- <in.json | file.bricktown | file.link.txt | link> [options]

  --url <url>     the running BrickTown app (default ${DEFAULT_BASE})
  --out <dir>     where the PNGs go (default: <input>-preview/ next to the input)
  --angles <n>    Workshop camera angles for a model, 1..4 (default 4: front-right, front-left, back-left, top)
  --size <WxH>    browser window (default 1280x800)
  --headed        show the browser
`

function fail(message: string, code = 2): never {
  process.stderr.write(`${message}\n`)
  process.exit(code)
}

const args = process.argv.slice(2)
let input: string | undefined
let url = DEFAULT_BASE
let outDir: string | undefined
let angles = 4
let width = 1280
let height = 800
let headed = false
for (let k = 0; k < args.length; k++) {
  const a = args[k]
  if (a === '--help' || a === '-h') {
    process.stdout.write(USAGE)
    process.exit(0)
  } else if (a === '--url') url = (args[++k] ?? fail('--url needs a value')).replace(/\/+$/, '')
  else if (a === '--out') outDir = args[++k] ?? fail('--out needs a directory')
  else if (a === '--angles') angles = Math.max(1, Math.min(4, Number(args[++k]) || 4))
  else if (a === '--size') {
    const m = /^(\d+)x(\d+)$/.exec(args[++k] ?? '')
    if (!m) fail('--size must look like 1280x800')
    width = Number(m[1])
    height = Number(m[2])
  } else if (a === '--headed') headed = true
  else if (a.startsWith('--')) fail(`unknown option ${a}\n\n${USAGE}`)
  else if (input === undefined) input = a
  else fail(`unexpected argument ${a}\n\n${USAGE}`)
}
if (!input) fail(`missing the input\n\n${USAGE}`)

/** The share payload (`#s=` value) of whatever was given. */
function payloadOf(arg: string): string {
  const fromLink = (text: string) => {
    const m = /#s=([A-Za-z0-9_-]+)/.exec(text.replace(/\s+/g, ''))
    return m ? m[1] : fail(`no "#s=" share link in ${arg}`)
  }
  if (/^https?:\/\//.test(arg) || arg.startsWith('#s=')) return fromLink(arg)
  const path = resolve(arg)
  if (!existsSync(path)) fail(`no such file: ${path}`)
  const text = readFileSync(path, 'utf8')
  if (path.endsWith('.bricktown')) {
    const payload = (JSON.parse(text) as { bricktown?: unknown }).bricktown
    return typeof payload === 'string' ? payload : fail(`${path} is not a .bricktown file`)
  }
  if (path.endsWith('.json')) {
    const result = pack(JSON.parse(text))
    if (!result.ok || !result.link) fail(`${path} does not pack:\n${result.report}\n\nRun npm run bt:pack -- ${arg} and fix it first.`, 1)
    return fromLink(result.link)
  }
  return fromLink(text)
}

const payload = payloadOf(input)
const out = resolve(outDir ?? (existsSync(resolve(input)) ? join(dirname(resolve(input)), `${basename(input).replace(/(\.link)?\.(json|bricktown|txt)$/, '')}-preview`) : 'bt-preview'))
mkdirSync(out, { recursive: true })

try {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
} catch (e) {
  fail(
    `BrickTown is not reachable at ${url} (${e instanceof Error ? e.message : String(e)}).\n` +
      'Start a dev server on a free port from the project root, in another terminal or in the background:\n' +
      '  npx vite --port 5199 --strictPort\n' +
      `then run again with --url http://localhost:5199 (if 5199 is taken, pick another port).`,
  )
}

interface BtWindow {
  __bt?: {
    useGame: { getState(): { data: { blueprints: Array<{ id: string; bricks: unknown[]; kind: string; baseplate: unknown }> } } }
    useEditor: { getState(): { loadBricks(bricks: unknown[], kind: string, baseplate: unknown, id?: string): void } }
    useApp: { getState(): { setMode(mode: string): void } }
    plateScreen: { pose: { frame: number; camera: number[] } | null; project: ((p: [number, number, number]) => { x: number; y: number }) | null }
  }
}

const shots: string[] = []
async function shot(page: Page, name: string, el?: string) {
  const path = join(out, `${name}.png`)
  if (el) await page.locator(el).first().screenshot({ path })
  else await page.screenshot({ path })
  shots.push(path)
}

/** Waits until the Workshop camera pose is unchanged over a few frames (like e2e/support's waitForCameraStill). */
async function cameraStill(page: Page) {
  for (let tries = 0; tries < 80; tries++) {
    const still = await page.evaluate(() => {
      const screen = (window as unknown as BtWindow).__bt?.plateScreen
      const start = screen?.pose
      if (!screen || !start) return false
      const key = JSON.stringify(start.camera)
      return new Promise<boolean>((done) => {
        const check = () => {
          const now = screen.pose
          if (!now || JSON.stringify(now.camera) !== key) done(false)
          else if (now.frame >= start.frame + 3) done(true)
          else requestAnimationFrame(check)
        }
        requestAnimationFrame(check)
      })
    })
    if (still) return
    await page.waitForTimeout(150)
  }
}

/** A point of the Workshop canvas showing sky (no HUD, above the model), where a drag turns the camera. */
async function skyPoint(page: Page, modelTop: number): Promise<{ x: number; y: number }> {
  return page.evaluate((top) => {
    const canvas = document.querySelector('[data-testid="mode-workshop"] canvas') as HTMLCanvasElement
    const r = canvas.getBoundingClientRect()
    const project = (window as unknown as BtWindow).__bt?.plateScreen.project
    const aboveY = project ? project([0, top + 2, 0]).y : r.top + r.height * 0.3
    for (const fy of [0.12, 0.18, 0.24, 0.3, 0.36, 0.08]) {
      for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7]) {
        const x = r.left + r.width * fx
        const y = r.top + r.height * fy
        if (y < aboveY && document.elementFromPoint(x, y) === canvas) return { x, y }
      }
    }
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.1 }
  }, modelTop)
}

async function orbit(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  const steps = 24
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + (dx * i) / steps, from.y + (dy * i) / steps)
  await page.mouse.up()
  await cameraStill(page)
}

const origin = new URL(url).origin
const browser = await chromium.launch({ headless: !headed })
let exit = 0
try {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    // Same seed as the e2e tests (playwright.config.ts): no onboarding, no install hint, no sound.
    storageState: {
      cookies: [],
      origins: [
        {
          origin,
          localStorage: [
            { name: 'bricktown-onboarded-v2', value: '1' },
            { name: 'bricktown-install-hint-dismissed', value: '1' },
            { name: 'bricktown-prefs', value: JSON.stringify({ state: { musicOn: false, sfxOn: false }, version: 0 }) },
          ],
        },
      ],
    },
  })
  const page = await context.newPage()
  await page.goto(`${url}/#s=${payload}`)
  const preview = page.getByTestId('import-preview')
  const error = page.getByTestId('import-error')
  await preview.or(error).first().waitFor({ timeout: 60_000 })
  if (await error.isVisible()) {
    await shot(page, '01-import-error')
    process.stderr.write(`The app refused the creation: ${await error.getAttribute('data-error')}\n`)
    exit = 1
  } else {
    const kind = await preview.getAttribute('data-kind')
    // The 3D thumbnail is drawn asynchronously: wait for the picture (or the fallback icon).
    await page.waitForFunction(() => {
      const img = document.querySelector('[data-testid="import-preview"] img.bt-import-thumb') as HTMLImageElement | null
      return (img && img.complete && img.naturalWidth > 0) || document.querySelector('[data-testid="import-preview"] .bt-thumb-fallback')
    }, undefined, { timeout: 60_000 })
    await shot(page, '01-import-preview')
    await shot(page, '02-thumbnail', '[data-testid="import-preview"] .bt-import-thumb')
    await page.getByTestId('import-confirm').click()
    const yes = page.getByTestId('confirm-yes')
    const done = page.getByTestId('import-done')
    await yes.or(done).first().waitFor()
    if (await yes.isVisible()) await yes.click()
    await done.waitFor()
    if (kind === 'model') {
      await page.getByTestId('import-done-ok').click()
      const top = await page.evaluate(() => {
        const bt = (window as unknown as BtWindow).__bt
        if (!bt) throw new Error('window.__bt is missing: use a dev server (npx vite), not a production build')
        const bps = bt.useGame.getState().data.blueprints
        const bp = bps[bps.length - 1]
        bt.useEditor.getState().loadBricks(bp.bricks, bp.kind, bp.baseplate, bp.id)
        bt.useApp.getState().setMode('workshop')
        const maxY = Math.max(...(bp.bricks as Array<{ y: number }>).map((b) => b.y + 3))
        return maxY * 0.4
      })
      await page.getByTestId('mode-workshop').locator('canvas').waitFor()
      await page.waitForFunction(() => (window as unknown as BtWindow).__bt?.plateScreen.project != null)
      await cameraStill(page)
      await page.waitForTimeout(500)
      await shot(page, '03-workshop-front-right')
      // OrbitControls turns 2*PI per canvas height dragged: a quarter of the height is 90 degrees.
      const quarter = height / 4
      const views: Array<[string, number, number]> = [['04-workshop-front-left', quarter, 0], ['05-workshop-back-left', quarter, 0], ['06-workshop-top', -quarter, height / 2]]
      for (const [name, dx, dy] of views.slice(0, angles - 1)) {
        await orbit(page, await skyPoint(page, top), dx, dy)
        await page.waitForTimeout(300)
        await shot(page, name)
      }
    } else {
      await page.getByTestId('import-go').click()
      await page.getByTestId(kind === 'city' ? 'city-canvas' : 'maze-picker').first().waitFor({ timeout: 60_000 }).catch(() => undefined)
      await page.waitForTimeout(3000) // the city builds its scene in chunks
      await shot(page, kind === 'city' ? '03-city' : '03-maze')
    }
  }
} finally {
  await browser.close()
}

process.stdout.write(`${shots.length} screenshot(s) in ${out}:\n${shots.map((s) => `  ${s}`).join('\n')}\n`)
process.stdout.write('Compare them with the photo: silhouette, colour blocks, proportions (studs), openings.\n')
process.exitCode = exit
