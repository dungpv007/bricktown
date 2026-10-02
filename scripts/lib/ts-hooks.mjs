// Node module hooks for the bt:* scripts: lets Node's built-in TypeScript support (type stripping)
// load the game's sources, which import each other without file extensions (Vite style).
import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HAS_EXT = /\.(?:[cm]?[jt]sx?|json)$/

const isFile = (url) => {
  const path = fileURLToPath(url)
  return existsSync(path) && statSync(path).isFile()
}

export async function resolve(specifier, context, next) {
  const relative = specifier.startsWith('./') || specifier.startsWith('../')
  if (relative && !HAS_EXT.test(specifier) && context.parentURL?.startsWith('file:')) {
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      const url = new URL(specifier + ext, context.parentURL)
      if (isFile(url)) return next(url.href, context)
    }
  }
  return next(specifier, context)
}
