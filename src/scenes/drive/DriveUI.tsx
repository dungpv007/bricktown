import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { hornKindForSource } from '../../audio/horns'
import { useEngineHum } from '../../audio/useEngineHum'
import VirtualJoystick from '../../input/VirtualJoystick'
import { DRIVE_KEYS, releaseOnInterruption, useDriveInput, type Pedal } from '../../state/useDriveInput'
import { useDriveStatus } from '../../state/useDriveStatus'
import { useGame } from '../../state/useGame'
import { useT, type TKey } from '../../ui/i18n'

interface ButtonProps {
  testId: string
  labelKey: TKey
  className: string
  children: ReactNode
}

/**
 * A pedal: pressed while a finger (or the mouse) is down on it, even if it slides off. Every finger
 * on it counts, so it stays down until the last one lifts.
 */
function HoldButton({ pedal, testId, labelKey, className, children }: ButtonProps & { pedal: Pedal }) {
  const t = useT()
  const lift = (e: ReactPointerEvent) => useDriveInput.getState().releasePedal(pedal, e.pointerId)
  return (
    <button
      className={`bt-btn bt-drive-btn ${className}`}
      data-testid={testId}
      aria-label={t(labelKey)}
      onPointerDown={(e: ReactPointerEvent<HTMLButtonElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        useDriveInput.getState().pressPedal(pedal, e.pointerId)
      }}
      onPointerUp={lift}
      onPointerCancel={lift}
      onLostPointerCapture={lift}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  )
}

/**
 * A one-shot button (horn, flip) that fires when the finger lifts. It does not wait for `click`:
 * Mobile Safari may not send one for a tap while another finger holds the stick or a pedal.
 * Keyboard activation (a click without a pointer, `detail === 0`) still works.
 */
function TapButton({ onTap, testId, labelKey, className, children }: ButtonProps & { onTap: () => void }) {
  const t = useT()
  const pressing = useRef<number | null>(null)
  return (
    <button
      className={`bt-btn bt-drive-btn ${className}`}
      data-testid={testId}
      aria-label={t(labelKey)}
      onPointerDown={(e: ReactPointerEvent<HTMLButtonElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        pressing.current = e.pointerId
      }}
      onPointerUp={(e) => {
        if (pressing.current !== e.pointerId) return
        pressing.current = null
        onTap()
      }}
      onPointerCancel={(e) => {
        if (pressing.current === e.pointerId) pressing.current = null
      }}
      onClick={(e) => {
        if (e.detail === 0) onTap()
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  )
}

/** Arrow keys / WASD drive, space brakes, H honks, F flips. */
function useKeyboard() {
  useEffect(() => {
    const input = useDriveInput.getState()
    const onDown = (e: KeyboardEvent) => {
      if (DRIVE_KEYS.has(e.code)) {
        e.preventDefault()
        input.keyDown(e.code)
      } else if (!e.repeat && e.code === 'KeyH') input.honk()
      else if (!e.repeat && e.code === 'KeyF') input.requestFlip()
    }
    const onUp = (e: KeyboardEvent) => input.keyUp(e.code)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])
}

/** Lets go of everything when the app is switched away from, and when the drive controls close. */
function useReleaseControls() {
  useEffect(() => {
    const { reset } = useDriveInput.getState()
    const stop = releaseOnInterruption(window, document, reset)
    return () => {
      stop()
      reset()
    }
  }, [])
}

/** Hidden mirror of the car's status for e2e specs (works in production builds too). */
function DriveStatusProbe() {
  const { x, z, speed, controllers, builds } = useDriveStatus()
  return (
    <output
      hidden
      data-testid="drive-status"
      data-x={x.toFixed(2)}
      data-z={z.toFixed(2)}
      data-speed={speed.toFixed(2)}
      data-controllers={controllers}
      data-builds={builds}
    />
  )
}

/** The horn matches the vehicle (police / fire siren, truck air horn, car beep). */
function useHornKind(source: string) {
  const blueprints = useGame((s) => s.data.blueprints)
  useEffect(() => {
    useDriveInput.getState().setHornKind(hornKindForSource(source, { blueprints }))
  }, [source, blueprints])
}

/**
 * On-screen driving controls: steering stick on the left, pedals, flip and horn on the right.
 * Also runs the engine hum and picks the horn for `source` (the vehicle being driven).
 */
export default function DriveUI({ source, onChangeVehicle }: { source: string; onChangeVehicle: () => void }) {
  const t = useT()
  const input = useDriveInput.getState()
  useKeyboard()
  useReleaseControls()
  useHornKind(source)
  useEngineHum()
  return (
    <div className="bt-drive-ui" data-testid="drive-ui">
      <DriveStatusProbe />
      <button className="bt-btn bt-icon-btn bt-drive-change" data-testid="drive-change" aria-label={t('driveChange')} onClick={onChangeVehicle}>
        🚙
      </button>
      <div className="bt-drive-left">
        <VirtualJoystick label={t('driveSteer')} onChange={input.setStick} />
      </div>
      <div className="bt-drive-right">
        <TapButton testId="drive-horn" labelKey="driveHorn" className="bt-drive-small bt-drive-horn" onTap={input.honk}>
          📯
        </TapButton>
        <TapButton testId="drive-flip" labelKey="driveFlip" className="bt-drive-small bt-drive-flip" onTap={input.requestFlip}>
          🔃
        </TapButton>
        <HoldButton pedal="reverse" testId="drive-reverse" labelKey="driveReverse" className="bt-drive-reverse">
          ▼
        </HoldButton>
        <HoldButton pedal="gas" testId="drive-gas" labelKey="driveGas" className="bt-drive-gas">
          ▲
        </HoldButton>
      </div>
    </div>
  )
}
