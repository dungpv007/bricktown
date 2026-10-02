import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { pop } from '../../audio/sfx'
import { getTemplate } from '../../content/templates'
import type { Brick } from '../../core/types'
import { BrickModel, GameStage, Minifig, RoundSummary, STAGE, Tappable, brick, useFrameRequest, type StageCamera } from '../kit'
import type { RoundOutcome } from '../rewards'
import { EmojiSprite } from './EmojiSprite'
import type { MissionPhase } from './mission'
import MiniMap from './MiniMap'
import type { MissionPlan } from './plan'
import { useRescueT } from './text'

/**
 * The station: the firefighter and the police officer behind the desk, the phone on it and both
 * vehicles parked in front. The phone rings (a big pulsing 📞 to answer), the call shows who needs
 * help and where (a picture and a mini map), and missions end back here with the summary.
 */

const TOP = STAGE.counterTop
/** The desk mat the ☎️ stands on. */
const PHONE_BASE: Brick[] = [brick('plate_4x4', 4)]
const CAMERA: StageCamera = { position: [0, 18, 25], target: [0, 4, -2], fov: 40, fitWidth: 42 }
const BACKDROP = { floor: '#A0A5A9', wall: '#E9DCC4', counter: '#C91A09', counterTop: '#F4F4F4' }

function Phone({ ringing, onTap }: { ringing: boolean; onTap: () => void }) {
  const group = useRef<THREE.Group>(null)
  const time = useRef(0)
  useFrameRequest(ringing)
  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    time.current += Math.min(dt, 0.1)
    // Brrring: a quick rattle, a short rest.
    const k = time.current % 1.2
    g.rotation.z = ringing && k < 0.6 ? Math.sin(time.current * 60) * 0.12 : 0
    g.position.y = ringing && k < 0.6 ? Math.abs(Math.sin(time.current * 30)) * 0.25 : 0
  })
  return (
    <Tappable onTap={onTap} hitSize={[7, 7, 7]} disabled={!ringing} position={[0, TOP, 0.6]}>
      <group ref={group}>
        <BrickModel bricks={PHONE_BASE} />
        <EmojiSprite emoji="☎️" size={5.5} position={[0, 3, 0]} through={false} />
      </group>
    </Tappable>
  )
}

function StationStage({ ringing, onAnswer }: { ringing: boolean; onAnswer: () => void }) {
  const truck = useMemo(() => getTemplate('fire_truck')?.bricks ?? [], [])
  const car = useMemo(() => getTemplate('police_car')?.bricks ?? [], [])
  return (
    <GameStage camera={CAMERA} backdrop={BACKDROP} background="#bfe3f2" testId="rescue-station">
      <Minifig fig="firefighter" position={[-5, 0, STAGE.customerZ]} />
      <Minifig fig="police" position={[5, 0, STAGE.customerZ]} />
      <Phone ringing={ringing} onTap={onAnswer} />
      <BrickModel bricks={truck} position={[-15, 0, 6]} rotation={[0, Math.PI * 0.85, 0]} scale={0.6} />
      <BrickModel bricks={car} position={[15, 0, 6]} rotation={[0, -Math.PI * 0.85, 0]} scale={0.75} />
      <EmojiSprite emoji="🚒" size={6} position={[-9, 10, STAGE.wallZ + 0.6]} through={false} />
      <EmojiSprite emoji="🚓" size={6} position={[9, 10, STAGE.wallZ + 0.6]} through={false} />
    </GameStage>
  )
}

/** A soft "brrring" while the phone rings. */
function useRingSound(ringing: boolean) {
  useEffect(() => {
    if (!ringing) return
    const ring = () => {
      pop()
      window.setTimeout(pop, 160)
    }
    ring()
    const id = window.setInterval(ring, 1400)
    return () => window.clearInterval(id)
  }, [ringing])
}

export interface StationProps {
  phase: MissionPhase
  plan: MissionPlan
  outcome: RoundOutcome | null
  onAnswer: () => void
  onGo: () => void
  onAgain: () => void
  onExit: () => void
}

export default function Station({ phase, plan, outcome, onAnswer, onGo, onAgain, onExit }: StationProps) {
  const t = useRescueT()
  const ringing = phase === 'ringing'
  useRingSound(ringing)
  const fire = plan.kind === 'fire'
  return (
    <>
      <StationStage ringing={ringing} onAnswer={onAnswer} />
      {ringing && (
        <div className="bt-rescue-ring">
          <button className="bt-btn bt-rescue-answer" data-testid="rescue-answer" aria-label={t('rescueAnswer')} onClick={onAnswer}>
            <span aria-hidden="true">📞</span>
          </button>
        </div>
      )}
      {phase === 'call' && (
        <div className="bt-play-overlay" data-testid="rescue-call" data-kind={plan.kind}>
          <div className="bt-play-card bt-rescue-call">
            <div className="bt-rescue-call-row">
              <div className="bt-rescue-bubble" role="img" aria-label={t(fire ? 'rescueFireCall' : 'rescuePoliceCall')}>
                <span className="bt-rescue-bubble-big" aria-hidden="true">{fire ? '🔥' : '🦹'}</span>
                <span className="bt-rescue-bubble-small" aria-hidden="true">{fire ? '🏠' : '🏪'}</span>
              </div>
              <MiniMap plan={plan} />
            </div>
            <button
              className={`bt-btn bt-yes bt-play-big bt-rescue-go bt-rescue-go-${plan.kind}`}
              data-testid="rescue-go"
              aria-label={t(fire ? 'rescueGoFire' : 'rescueGoPolice')}
              onClick={onGo}
            >
              <span aria-hidden="true">{fire ? '🚒' : '🚓'} ▶️</span>
            </button>
          </div>
        </div>
      )}
      {phase === 'summary' && <RoundSummary outcome={outcome} onAgain={onAgain} onExit={onExit} />}
    </>
  )
}
