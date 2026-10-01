function randomHex12(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  }
  // crypto.randomUUID only exists in secure contexts (not plain HTTP on a LAN).
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Short random id, unique in practice (48 bits of randomness). */
export function newId(prefix?: string): string {
  const id = randomHex12()
  return prefix ? `${prefix}_${id}` : id
}
