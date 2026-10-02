import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { horn, success } from '../../audio/sfx'
import { templateSource } from '../../render/sources'
import { currentCity } from '../../core/cities'
import { useDriveInput } from '../../state/useDriveInput'
import { useGame } from '../../state/useGame'
import Confetti from '../../ui/Confetti'
import DriveUI from '../../scenes/drive/DriveUI'
import type { GameSceneProps } from '../kit'
import type { RoundOutcome } from '../rewards'
import { playOf } from '../usePlay'
import { useRescueLive } from './live'
import { inCity, MISSION_VEHICLE, missionStep, nextKind, recordMission, type MissionEvent, type MissionPhase } from './mission'
import { planMission, type MissionPlan } from './plan'
import RescueDrive from './RescueDrive'
import Station from './Station'
import { useRescueT } from './text'
import './rescue.css'

/**
 * 🚒 Fire and police dispatch (`rescue`). The phone rings at the station; the call shows a burning
 * building or a robber at a shop of the kid's current city (or of the built-in town); the kid drives
 * the fire truck / police car there in Drive's physics with a big guide arrow, holds 💦 until the
 * flames go out or taps the running robber, the crowd cheers, and the summary waits back at the
 * station. No fail state: the arrow keeps guiding however the kid wanders.
 */

/** How long the crowd cheers before the station summary (ms). */
const CHEER_MS = 3200

function newPlan(avoid: string | null): MissionPlan {
  const data = useGame.getState().data
  return planMission(currentCity(data), data, nextKind(playOf(data)), avoid)
}

/** The big 💦 button: hold it (finger, mouse or space bar) to spray; its ring fills as the fire goes out. */
function SprayButton() {
  const t = useRescueT()
  const progress = useRescueLive((s) => s.progress)
  const holding = useRescueLive((s) => s.holding)
  const pointers = useRef(new Set<number>())
  const set = useRescueLive.getState().setHolding
  const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.add(e.pointerId)
    set(true)
  }
  const up = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) set(false)
  }
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        set(true)
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') set(false)
    }
    const release = () => set(false)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', release)
      set(false)
    }
  }, [set])
  const pct = Math.round(progress * 100)
  return (
    <div className="bt-rescue-spray-wrap">
      <button
        className="bt-btn bt-rescue-spray"
        data-testid="rescue-spray"
        data-progress={pct}
        data-holding={holding}
        aria-label={t('rescueSpray')}
        style={{ '--bt-rescue-p': `${pct}%` } as CSSProperties}
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={up}
        onLostPointerCapture={up}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span aria-hidden="true">💦</span>
      </button>
    </div>
  )
}

/** Dev / e2e handle: `window.__btRescue` (teleport to the target, catch the robber, read the phase). */
interface TestHandle {
  phase: () => MissionPhase
  kind: () => string
  teleport: () => void
  done: () => void
}

export default function RescueGame({ onExit }: GameSceneProps) {
  const t = useRescueT()
  const [phase, setPhase] = useState<MissionPhase>('ringing')
  const [plan, setPlan] = useState<MissionPlan>(() => newPlan(null))
  const [caught, setCaught] = useState(false)
  const [outcome, setOutcome] = useState<RoundOutcome | null>(null)
  const phaseRef = useRef(phase)
  const driveStart = useRef(0)
  const driveSeconds = useRef(0)

  const step = useCallback((event: MissionEvent) => {
    const next = missionStep(phaseRef.current, event)
    if (next === phaseRef.current) return false
    phaseRef.current = next
    setPhase(next)
    return true
  }, [])

  const answer = useCallback(() => {
    step('answer')
  }, [step])

  const go = useCallback(() => {
    if (!step('go')) return
    useRescueLive.getState().reset()
    driveStart.current = performance.now()
    horn(plan.kind)
  }, [step, plan.kind])

  const arrive = useCallback(() => {
    if (!step('arrive')) return
    driveSeconds.current = (performance.now() - driveStart.current) / 1000
    success()
  }, [step])

  const done = useCallback(() => {
    if (phaseRef.current !== 'action') return
    // Paid now: leaving during the cheer keeps the coins.
    const result = recordMission(playOf(useGame.getState().data), plan.kind, driveSeconds.current)
    useGame.getState().update((d) => ({ ...d, play: result.play }))
    setOutcome(result)
    if (plan.kind === 'police') setCaught(true)
    step('done')
  }, [step, plan.kind])

  const again = useCallback(() => {
    setPlan((p) => newPlan(p.target.placementId))
    setCaught(false)
    setOutcome(null)
    useRescueLive.getState().reset()
    step('again')
  }, [step])

  // The cheer, then back to the station.
  useEffect(() => {
    if (phase !== 'cheer') return
    const id = window.setTimeout(() => step('finish'), CHEER_MS)
    return () => window.clearTimeout(id)
  }, [phase, step])

  // At the target the truck stops and stays put (the drive controls are gone meanwhile).
  useEffect(() => {
    if (phase !== 'action' && phase !== 'cheer') return
    const input = useDriveInput.getState()
    input.reset()
    input.keyDown('Space')
    return () => useDriveInput.getState().keyUp('Space')
  }, [phase])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __btRescue?: TestHandle }
    w.__btRescue = {
      phase: () => phaseRef.current,
      kind: () => plan.kind,
      teleport: () => useDriveInput.getState().requestPlace({ x: plan.target.ring.x, z: plan.target.ring.z, yaw: plan.spawn.yaw }),
      done,
    }
    return () => {
      delete w.__btRescue
    }
  }, [plan, done])

  const city = inCity(phase)
  return (
    <div className="bt-rescue" data-testid="rescue-game" data-phase={phase} data-kind={plan.kind} data-builtin={plan.builtIn}>
      {city ? (
        <>
          <RescueDrive plan={plan} phase={phase} caught={caught} onArrive={arrive} onDone={done} />
          {phase === 'drive' && (
            <>
              <DriveUI source={templateSource(MISSION_VEHICLE[plan.kind])} />
              <div className="bt-rescue-chip" data-testid="rescue-goal" aria-hidden="true">
                {plan.kind === 'fire' ? '🚒 ➜ 🔥' : '🚓 ➜ 🦹'}
              </div>
            </>
          )}
          {phase === 'action' && plan.kind === 'fire' && <SprayButton />}
          {phase === 'action' && plan.kind === 'police' && (
            <div className="bt-rescue-chip bt-rescue-chip-tap" data-testid="rescue-catch-hint" role="status" aria-label={t('rescueCatch')}>
              <span aria-hidden="true">👆 🦹</span>
            </div>
          )}
          {phase === 'cheer' && (
            <>
              <Confetti />
              <div className="bt-rescue-chip bt-rescue-chip-cheer" data-testid="rescue-cheer" role="status" aria-label={t('rescueHurray')}>
                <span aria-hidden="true">{plan.kind === 'fire' ? '🎉 🧑‍🚒 🎉' : '🎉 👮 🎉'}</span>
              </div>
            </>
          )}
        </>
      ) : (
        <Station phase={phase} plan={plan} outcome={outcome} onAnswer={answer} onGo={go} onAgain={again} onExit={onExit} />
      )}
    </div>
  )
}
