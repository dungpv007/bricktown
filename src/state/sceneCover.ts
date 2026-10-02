import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * Full-screen dialogs over a 3D scene: while one is open the scene's render loop pauses (nothing under
 * the dialog needs to move), like the menu backdrop does under the menu's dialogs.
 */
export const useSceneCover = create<{ count: number }>()(() => ({ count: 0 }))

/** Marks the scene as covered while the calling dialog is mounted (and `active`). */
export function useCoverScene(active = true): void {
  useEffect(() => {
    if (!active) return
    useSceneCover.setState((s) => ({ count: s.count + 1 }))
    return () => useSceneCover.setState((s) => ({ count: Math.max(0, s.count - 1) }))
  }, [active])
}
