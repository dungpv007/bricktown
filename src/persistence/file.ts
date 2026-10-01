import { exportSave, importSave } from '../core/serialize'
import type { SaveData } from '../core/types'

function todayStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Triggers a download of `data` as `bricktown-slot<N>-<yyyy-mm-dd>.json`. */
export function downloadSave(data: SaveData, slotId: number): void {
  const blob = new Blob([exportSave(data)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `bricktown-slot${slotId}-${todayStamp()}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export type ImportOutcome =
  | { status: 'ok'; data: SaveData }
  /** The kid closed the file picker without choosing anything. */
  | { status: 'cancelled' }
  /** A file was chosen but it is not a readable backup. */
  | { status: 'invalid' }

/** Opens a file picker and parses the chosen backup. */
export function pickAndImportSave(): Promise<ImportOutcome> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.style.display = 'none'
    const finish = (result: ImportOutcome) => {
      input.remove()
      resolve(result)
    }
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) return finish({ status: 'cancelled' })
      file
        .text()
        .then((text) => {
          const data = importSave(text)
          finish(data ? { status: 'ok', data } : { status: 'invalid' })
        })
        .catch((e) => {
          console.error('bricktown: import failed', e)
          finish({ status: 'invalid' })
        })
    })
    input.addEventListener('cancel', () => finish({ status: 'cancelled' }))
    document.body.appendChild(input)
    input.click()
  })
}
