import { useEffect, type PointerEvent as ReactPointerEvent } from 'react'
import type { StepDir } from '../../core/mazeStep'
import { releaseOnInterruption } from '../../state/useDriveInput'
import { useMazeStep } from '../../state/useMazeStep'
import { useT, type TKey } from '../../ui/i18n'

/** Arrow keys and WASD (`KeyboardEvent.code`) as screen directions of the top-down view. */
export const STEP_KEYS: Readonly<Record<string, StepDir>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
}

const BUTTONS: ReadonlyArray<{ dir: StepDir; label: TKey; glyph: string }> = [
  { dir: 'up', label: 'mazeStepUp', glyph: '▲' },
  { dir: 'left', label: 'mazeStepLeft', glyph: '◀' },
  { dir: 'right', label: 'mazeStepRight', glyph: '▶' },
  { dir: 'down', label: 'mazeStepDown', glyph: '▼' },
]

/** Typing in a text field (or an editable element) keeps its keys. */
function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
}

/** Arrow keys / WASD step and repeat while held; not with Ctrl, Meta or Alt, nor while typing. */
function useStepKeys() {
  useEffect(() => {
    const input = useMazeStep.getState()
    const onDown = (e: KeyboardEvent) => {
      const dir = STEP_KEYS[e.code]
      if (!dir || e.ctrlKey || e.metaKey || e.altKey || typingIn(e.target)) return
      e.preventDefault()
      if (!e.repeat) input.press(dir, `key:${e.code}`)
    }
    const onUp = (e: KeyboardEvent) => input.release(`key:${e.code}`)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    const stop = releaseOnInterruption(window, document, input.reset)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      stop()
      input.reset()
    }
  }, [])
}

/** One arrow: steps on pointerdown and keeps stepping while the finger (or mouse) stays down. */
function StepButton({ dir, label, glyph }: { dir: StepDir; label: TKey; glyph: string }) {
  const t = useT()
  const held = useMazeStep((s) => s.held.some((h) => h.dir === dir && h.source.startsWith('ptr:')))
  const lift = (e: ReactPointerEvent) => useMazeStep.getState().release(`ptr:${e.pointerId}`)
  return (
    <button
      className={`bt-btn bt-maze-step bt-maze-step-${dir}`}
      data-testid={`maze-step-${dir}`}
      data-held={held ? 'true' : undefined}
      aria-label={t(label)}
      onPointerDown={(e: ReactPointerEvent<HTMLButtonElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        useMazeStep.getState().press(dir, `ptr:${e.pointerId}`)
      }}
      onPointerUp={lift}
      onPointerCancel={lift}
      onLostPointerCapture={lift}
      onClick={(e) => {
        // Keyboard activation (Enter on a focused arrow): one step.
        if (e.detail !== 0) return
        const input = useMazeStep.getState()
        input.press(dir, 'click')
        input.release('click')
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {glyph}
    </button>
  )
}

/**
 * The top-down view's block-step controls: four arrows in a cross (in place of the stick and the
 * pedals) plus the arrow keys and WASD. Up is the top of the screen.
 */
export default function MazeStepPad() {
  useStepKeys()
  return (
    <div className="bt-maze-steppad" data-testid="maze-steppad">
      {BUTTONS.map((b) => (
        <StepButton key={b.dir} {...b} />
      ))}
    </div>
  )
}
