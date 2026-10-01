import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { stickAxis } from '../state/useDriveInput'

interface Props {
  /** Horizontal axis, -1 (left) .. +1 (right); called on every move and with 0 on release. */
  onChange: (x: number) => void
  label: string
  /** Pixels the knob may travel from the centre. */
  radius?: number
}

/**
 * Left-thumb steering stick: drag the knob sideways to steer; it springs back when released.
 * Pointer capture keeps tracking the thumb when it slides off the pad, so other fingers stay free
 * for the pedals.
 */
export default function VirtualJoystick({ onChange, label, radius = 64 }: Props) {
  const [knob, setKnob] = useState(0) // knob x offset (px); the stick only moves sideways
  const active = useRef<{ id: number; cx: number } | null>(null)

  const move = (e: ReactPointerEvent) => {
    const a = active.current
    if (!a || a.id !== e.pointerId) return
    const dx = e.clientX - a.cx
    setKnob(Math.max(-radius, Math.min(radius, dx)))
    onChange(stickAxis(dx, radius))
  }

  const release = (e: ReactPointerEvent) => {
    if (active.current?.id !== e.pointerId) return
    active.current = null
    setKnob(0)
    onChange(0)
  }

  return (
    <div
      className="bt-joystick"
      data-testid="drive-joystick"
      role="slider"
      aria-label={label}
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={Math.round((knob / radius) * 100) / 100}
      onPointerDown={(e) => {
        if (active.current) return
        const rect = e.currentTarget.getBoundingClientRect()
        active.current = { id: e.pointerId, cx: rect.left + rect.width / 2 }
        e.currentTarget.setPointerCapture(e.pointerId)
        move(e)
      }}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="bt-joystick-arrow bt-joystick-left" aria-hidden="true">◀</span>
      <span className="bt-joystick-arrow bt-joystick-right" aria-hidden="true">▶</span>
      <span className="bt-joystick-knob" style={{ transform: `translateX(${knob}px)` }} />
    </div>
  )
}
