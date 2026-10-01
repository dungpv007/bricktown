/**
 * The ways a share leaves the device: the system share sheet, the clipboard, a downloaded file.
 * Browser-only (checked by e2e and by hand, not unit-tested).
 */

/** True when the browser has a share sheet (most phones and tablets). */
export const canShareNative = (): boolean => typeof navigator !== 'undefined' && typeof navigator.share === 'function'

const fileOf = (text: string, fileName: string) => new File([text], fileName, { type: 'application/json' })

/**
 * Opens the share sheet with the link, and the `.bricktown` file where the browser can share files.
 * Resolves false when sharing failed (not when the kid closed the sheet).
 */
export async function shareNative(opts: { title: string; url: string; fileText: string; fileName: string }): Promise<boolean> {
  const file = fileOf(opts.fileText, opts.fileName)
  const withFile = { title: opts.title, url: opts.url, files: [file] }
  const data: ShareData = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }) ? withFile : { title: opts.title, url: opts.url }
  try {
    await navigator.share(data)
    return true
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError'
  }
}

/** Copies `text`: the Clipboard API, else a hidden text field and `execCommand` (older Safari, http pages). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // denied or unavailable: try the old way
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  area.setSelectionRange(0, text.length)
  let ok: boolean
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  area.remove()
  return ok
}

/** Saves `text` as a file through the browser's download. */
export function downloadText(text: string, fileName: string): void {
  const url = URL.createObjectURL(fileOf(text, fileName))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
