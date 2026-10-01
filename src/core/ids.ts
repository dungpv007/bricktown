/** Short random id, unique in practice (48 bits of randomness). */
export function newId(prefix?: string): string {
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  return prefix ? `${prefix}_${id}` : id
}
