/**
 * Where share links point. Links carry the whole creation, but they only open on a friend's device
 * when the game is hosted at a public address: `VITE_SHARE_BASE_URL` when it is set, else this page.
 */
export function shareBase(
  configured: string | undefined = import.meta.env.VITE_SHARE_BASE_URL,
  origin: string = typeof location === 'undefined' ? '' : location.origin,
): string {
  return configured || origin
}

const PRIVATE_V4 = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./]

/**
 * True when other devices could not open a link to `base`: this device (localhost), a home network
 * address, a `.local` name, or something that is not an address at all. The share dialog then
 * suggests the file, which works everywhere.
 */
export function isLocalBase(base: string): boolean {
  let host: string
  try {
    host = new URL(base).hostname.toLowerCase()
  } catch {
    return true
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '') return true
  if (host.startsWith('[')) return host === '[::1]' || /^\[f[cd]/.test(host) || host.startsWith('[fe80:')
  return PRIVATE_V4.some((re) => re.test(host))
}
