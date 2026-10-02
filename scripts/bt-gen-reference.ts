// npm run bt:ref
//
// Regenerates the reference docs of the lego-photo-to-bricktown skill and the self-contained web
// prompt from the real catalog (parts, colours, figures, templates, prints), so they never drift
// from the game. Run it after changing the catalog, the templates or the authoring format.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { authoringMd, colorsMd, figuresMd, partsMd, printsMd, promptMd, templatesMd } from './lib/reference'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const refDir = join(root, '.claude/skills/lego-photo-to-bricktown/reference')

const files: Array<[string, string]> = [
  [join(refDir, 'parts.md'), partsMd()],
  [join(refDir, 'colors.md'), colorsMd()],
  [join(refDir, 'figures.md'), figuresMd()],
  [join(refDir, 'templates.md'), templatesMd()],
  [join(refDir, 'prints.md'), printsMd()],
  [join(refDir, 'authoring-format.md'), authoringMd()],
  [join(root, 'docs/prompts/lego-photo-to-bricktown.md'), promptMd()],
]

for (const [path, text] of files) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`)
  process.stdout.write(`wrote ${relative(root, path)} (${text.length} characters)\n`)
}
