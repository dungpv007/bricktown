import { Component, Suspense, useEffect, type ReactNode } from 'react'
import { consumeShareHash, useShareImport } from '../../state/useShareImport'
import { lazyScene } from '../lazyScene'

const ImportDialogs = lazyScene(() => import('./ImportDialogs'))

/** A failed dialog chunk must not take the game down: the import is dropped instead. */
class DialogBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('bricktown: import dialog failed', error)
    useShareImport.getState().dismiss()
    useShareImport.getState().closePicker()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

/**
 * Receives shared creations once the save is loaded: a link the app was opened with (`#s=...`, also
 * when a link is pasted into the address bar of the open app) and files dropped on the window.
 * The dialogs themselves load on demand.
 */
export default function ShareImportHost() {
  const open = useShareImport((s) => s.pickerOpen || s.incoming !== null || s.done !== null)
  const seq = useShareImport((s) => s.seq)

  useEffect(() => {
    const takeHash = () => {
      const hash = consumeShareHash(window.location, window.history)
      if (hash) useShareImport.getState().receiveHash(hash)
    }
    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault() // allows the drop
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault() // never let the browser navigate away to the file
      const file = e.dataTransfer?.files[0]
      if (file) void useShareImport.getState().receiveFile(file)
    }
    takeHash()
    window.addEventListener('hashchange', takeHash)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('hashchange', takeHash)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  if (!open) return null
  return (
    <DialogBoundary key={seq}>
      <Suspense fallback={null}>
        <ImportDialogs />
      </Suspense>
    </DialogBoundary>
  )
}
