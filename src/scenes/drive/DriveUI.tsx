import { useEffect, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import VirtualJoystick from '../../input/VirtualJoystick'
import { DRIVE_KEYS, useDriveInput } from '../../state/useDriveInput'
import { useT, type TKey } from '../../ui/i18n'

/** A pedal: pressed while a finger (or the mouse) is down on it, even if it slides off. */
function HoldButton(props: { testId: string; labelKey: TKey; className: string; onHold: (held: boolean) => void; children: ReactNode }) {
  const { testId, labelKey, className, onHold, children } = props
  const t = useT()
  const release = () => onHold(false)
  return (
    <button
      className={`bt-btn bt-drive-btn ${className}`}
      data-testid={testId}
      aria-label={t(labelKey)}
      onPointerDown={(e: ReactPointerEvent<HTMLButtonElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        onHold(true)
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
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
    const onBlur = () => input.clearKeys()
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
      input.reset()
    }
  }, [])
}

/** On-screen driving controls: steering stick on the left, pedals, flip and horn on the right. */
export default function DriveUI({ onChangeVehicle }: { onChangeVehicle: () => void }) {
  const t = useT()
  const input = useDriveInput.getState()
  useKeyboard()
  return (
    <div className="bt-drive-ui" data-testid="drive-ui">
      <button className="bt-btn bt-icon-btn bt-drive-change" data-testid="drive-change" aria-label={t('driveChange')} onClick={onChangeVehicle}>
        🚙
      </button>
      <div className="bt-drive-left">
        <VirtualJoystick label={t('driveSteer')} onChange={input.setStick} />
      </div>
      <div className="bt-drive-right">
        <button className="bt-btn bt-drive-btn bt-drive-small bt-drive-horn" data-testid="drive-horn" aria-label={t('driveHorn')} onClick={input.honk}>
          📯
        </button>
        <button className="bt-btn bt-drive-btn bt-drive-small bt-drive-flip" data-testid="drive-flip" aria-label={t('driveFlip')} onClick={input.requestFlip}>
          🔃
        </button>
        <HoldButton testId="drive-reverse" labelKey="driveReverse" className="bt-drive-reverse" onHold={input.setReverse}>
          ▼
        </HoldButton>
        <HoldButton testId="drive-gas" labelKey="driveGas" className="bt-drive-gas" onHold={input.setGas}>
          ▲
        </HoldButton>
      </div>
    </div>
  )
}
