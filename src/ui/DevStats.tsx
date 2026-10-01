import { lazy, Suspense } from 'react'

// Lazy and behind a build-time constant, so production builds contain no trace of it.
const Stats =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('stats')
    ? lazy(() => import('@react-three/drei').then((m) => ({ default: m.Stats })))
    : null

/** FPS counter for developers: dev builds only, and only when the URL has `?stats`. */
export default function DevStats() {
  return Stats ? (
    <Suspense fallback={null}>
      <Stats className="bt-stats" />
    </Suspense>
  ) : null
}
