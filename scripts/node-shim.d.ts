// The few Node APIs the bt:* scripts use. The project has no @types/node (see playwright.config.ts),
// so these module declarations type-check the scripts without adding a dependency. Only modules that
// are imported see them: nothing here is global, so app code cannot use Node APIs by accident.

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string
  export function writeFileSync(path: string, data: string | Uint8Array): void
  export function existsSync(path: string): boolean
  export function mkdirSync(path: string, opts?: { recursive?: boolean }): void
}

declare module 'node:path' {
  export function resolve(...parts: string[]): string
  export function join(...parts: string[]): string
  export function dirname(path: string): string
  export function basename(path: string, ext?: string): string
  export function relative(from: string, to: string): string
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string
}

declare module 'node:process' {
  const process: {
    argv: string[]
    env: Record<string, string | undefined>
    exitCode: number | undefined
    exit(code?: number): never
    cwd(): string
    stdout: { write(s: string): boolean; isTTY?: boolean }
    stderr: { write(s: string): boolean }
  }
  export default process
}
