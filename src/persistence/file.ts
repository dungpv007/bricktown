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

/** Opens a file picker and parses the chosen backup; null when cancelled or the file is invalid. */
export function pickAndImportSave(): Promise<SaveData | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.style.display = 'none'
    const finish = (result: SaveData | null) => {
      input.remove()
      resolve(result)
    }
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) return finish(null)
      file
        .text()
        .then((text) => finish(importSave(text)))
        .catch((e) => {
          console.error('bricktown: import failed', e)
          finish(null)
        })
    })
    input.addEventListener('cancel', () => finish(null))
    document.body.appendChild(input)
    input.click()
  })
}
