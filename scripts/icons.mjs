// Renders the PWA PNG icons from public/icon.svg:  node scripts/icons.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const publicDir = fileURLToPath(new URL('../public/', import.meta.url))
const svg = await readFile(`${publicDir}icon.svg`, 'utf8')

const BACKGROUND = /<rect width="64" height="64"[^>]*\/>/
const background = svg.match(BACKGROUND)?.[0]
const inner = svg.replace(/<svg[^>]*>/, '').replace('</svg>', '').replace(BACKGROUND, '')
if (!background) throw new Error('icon.svg: background rect not found')
const SKY = background.match(/fill="([^"]+)"/)?.[1] ?? '#87ceeb'

/** The artwork on a full-bleed square, scaled about the centre (maskable icons keep to the inner 80%). */
const fullBleed = (scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${SKY}"/>` +
  `<g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${inner}</g></svg>`

const targets = [
  // Transparent rounded corners, as designed.
  { file: 'icon-192.png', size: 192, source: svg },
  { file: 'icon-512.png', size: 512, source: svg },
  // Android may crop to any shape: full bleed, artwork inside the safe zone.
  { file: 'icon-maskable-512.png', size: 512, source: fullBleed(0.68) },
  // iOS paints transparent pixels black and rounds the corners itself: full bleed, no transparency.
  { file: 'apple-touch-icon.png', size: 180, source: fullBleed(0.9) },
]

for (const { file, size, source } of targets) {
  const png = await sharp(Buffer.from(source), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer()
  await writeFile(`${publicDir}${file}`, png)
  console.log(`${file} ${size}x${size} ${png.length} bytes`)
}
