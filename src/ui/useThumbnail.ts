import { useEffect, useRef, useState } from 'react'

/**
 * Resolves a thumbnail data URL; '' while loading or when rendering is unavailable.
 * `load` is only re-run when `key` changes (it must be fully determined by `key`).
 */
export function useThumbnail(key: string, load: () => Promise<string>): string {
  const [url, setUrl] = useState('') // the previous picture stays up while the next one renders
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })
  useEffect(() => {
    let alive = true
    void loadRef.current().then((next) => {
      if (alive) setUrl(next)
    })
    return () => {
      alive = false
    }
  }, [key])
  return url
}
