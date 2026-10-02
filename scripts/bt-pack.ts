// npm run bt:pack -- <in.json> [--out <path>] [--fix] [--layers] [--base <url>] [--json]
//
// Checks a BrickTown authoring JSON file (a model, city or maze written by hand or by an agent, see
// .claude/skills/lego-photo-to-bricktown) with the game's own rules, then writes the `.bricktown`
// file the game's 📥 Import accepts and prints the share link. Exit code 0 = written, 1 = problems
// in the input (nothing written), 2 = usage or file error.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { DEFAULT_BASE, pack } from './lib/pack'

const USAGE = `usage: npm run bt:pack -- <in.json> [options]

  --out <path>   output path without extension (default: next to the input)
                 writes <path>.bricktown and <path>.link.txt
  --fix          safe repairs: drop duplicate / overlapping bricks, move a sunk or
                 floating brick up/down onto the nearest support when unambiguous;
                 the repaired input is saved as <path>.fixed.json
  --layers       print an ASCII top-down map per layer (y in plates)
  --base <url>   base of the share link (default ${DEFAULT_BASE})
  --json         print the result as JSON (errors, warnings, fixes, link, files)
`

function fail(message: string): never {
  process.stderr.write(`${message}\n\n${USAGE}`)
  process.exit(2)
}

const args = process.argv.slice(2)
let input: string | undefined
let out: string | undefined
let base = DEFAULT_BASE
let fix = false
let layers = false
let json = false
for (let k = 0; k < args.length; k++) {
  const a = args[k]
  if (a === '--help' || a === '-h') {
    process.stdout.write(USAGE)
    process.exit(0)
  } else if (a === '--out') out = args[++k] ?? fail('--out needs a path')
  else if (a === '--base') base = args[++k] ?? fail('--base needs a url')
  else if (a === '--fix') fix = true
  else if (a === '--layers') layers = true
  else if (a === '--json') json = true
  else if (a.startsWith('--')) fail(`unknown option ${a}`)
  else if (input === undefined) input = a
  else fail(`unexpected argument ${a}`)
}
if (!input) fail('missing the input file')
const inPath = resolve(input)
if (!existsSync(inPath)) fail(`no such file: ${inPath}`)

let raw: unknown
try {
  raw = JSON.parse(readFileSync(inPath, 'utf8'))
} catch (e) {
  fail(`${inPath} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`)
}

const result = pack(raw, { fix, layers, base })
const outBase = resolve(out ?? inPath.replace(/\.json$/i, ''))
const written: string[] = []
if (result.fixedInput !== undefined) {
  const fixedPath = `${outBase}.fixed.json`
  mkdirSync(dirname(fixedPath), { recursive: true })
  writeFileSync(fixedPath, `${JSON.stringify(result.fixedInput, null, 2)}\n`)
  written.push(fixedPath)
}
if (result.ok && result.fileText && result.link) {
  mkdirSync(dirname(outBase), { recursive: true })
  writeFileSync(`${outBase}.bricktown`, result.fileText)
  writeFileSync(`${outBase}.link.txt`, `${result.link}\n`)
  written.push(`${outBase}.bricktown`, `${outBase}.link.txt`)
}

if (json) {
  const r = result.result
  process.stdout.write(`${JSON.stringify({
    ok: result.ok,
    errors: r.ok ? [] : r.errors,
    warnings: r.warnings,
    fixes: r.fixes,
    roundTrip: result.roundTrip ?? [],
    link: result.link ?? null,
    files: written,
  }, null, 2)}\n`)
} else {
  process.stdout.write(`${result.report}\n`)
  if (written.length) process.stdout.write(`\nwrote:\n${written.map((f) => `  ${f}`).join('\n')}\n`)
  if (result.ok && result.link) {
    process.stdout.write(`\nshare link:\n${result.link}\n`)
    process.stdout.write('\nImport: in BrickTown press 📥 Nhập → choose the .bricktown file, or open the link.\n')
  }
}
process.exitCode = result.ok ? 0 : 1
