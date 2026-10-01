import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { releaseOnInterruption, stickAxis } from '../state/useDriveInput'

interface Props {
  /** Horizontal axis, -1 (left) .. +1 (right); called on every move and with 0 on release. */
  onChange: (x: number) => void
  label: string
  /** Pixels the knob may travel from the centre (default: in proportion to the pad, 64px on a tablet's 240px pad). */
  radius?: number
}

/** Knob travel per pixel of pad width when no `radius` is given. */
const TRAVEL_PER_WIDTH = 64 / 240

/**
 * Left-thumb steering stick: drag the knob sideways to steer; it springs back when released.
 * Pointer capture keeps tracking the thumb when it slides off the pad, so other fingers stay free
 * for the pedals.
 */
export default function VirtualJoystick({ onChange, label, radius: fixedRadius }: Props) {
  const [knob, setKnob] = useState(0) // knob x offset (px); the stick only moves sideways
  // The pad is smaller on phones: the travel follows its size, measured when a thumb lands.
  const [radius, setRadius] = useState(fixedRadius ?? 64)
  const active = useRef<{ id: number; cx: number; radius: number } | null>(null)

  // Switching away from the app can swallow the thumb's pointerup: let go, so the knob springs back
  // and the next touch is taken.
  useEffect(
    () =>
      releaseOnInterruption(window, document, () => {
        active.current = null
        setKnob(0)
        onChange(0)
      }),
    [onChange],
  )

  const move = (e: ReactPointerEvent) => {
    const a = active.current
    if (!a || a.id !== e.pointerId) return
    const dx = e.clientX - a.cx
    setKnob(Math.max(-a.radius, Math.min(a.radius, dx)))
    onChange(stickAxis(dx, a.radius))
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
        const r = fixedRadius ?? Math.round(rect.width * TRAVEL_PER_WIDTH)
        active.current = { id: e.pointerId, cx: rect.left + rect.width / 2, radius: r }
        setRadius(r)
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
