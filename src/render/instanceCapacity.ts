import { useState } from 'react'

/**
 * Instance-buffer size for `count` instances given the `current` size (0 = none yet): powers of two
 * of `min`. It grows by doubling when full, and shrinks only once the count falls to a quarter of
 * the buffer (down to twice the count), so adding or removing one instance around a power of two
 * does not rebuild the mesh every time.
 */
export function nextCapacity(current: number, count: number, min: number): number {
  let cap = Math.max(current, min)
  if (count > cap) {
    while (cap < count) cap *= 2
    return cap
  }
  if (cap > min && count <= cap / 4) {
    cap = min
    while (cap < count * 2) cap *= 2
  }
  return cap
}

/** `nextCapacity`, remembered between renders. A change remounts the instanced mesh (it is the `key`). */
export function useInstanceCapacity(count: number, min: number): number {
  const [capacity, setCapacity] = useState(() => nextCapacity(0, count, min))
  const next = nextCapacity(capacity, count, min)
  // Adjusting state while rendering is React's way to derive state from props: it re-renders at once.
  if (next !== capacity) setCapacity(next)
  return next
}
