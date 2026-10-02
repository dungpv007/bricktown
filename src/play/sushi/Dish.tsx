import { useRef } from 'react'
import type * as THREE from 'three'
import { thunk } from '../../audio/sfx'
import { BrickModel } from '../kit'
import { PopIn, useTween } from './anim'
import { KNIFE, NIGIRI_RICE, RICE_LAYER, ROLL_SLICE, SHEET, fillingLayer, nigiriTopping } from './food'
import { hasDone, type Cook } from './logic'

/** The animation playing on the mat (input waits meanwhile). */
export type MatAnim = 'roll' | 'cut' | 'press' | null

const MAT_TOP = 0.4
/** Seconds of each animation. */
export const ANIM_SECONDS: Record<Exclude<MatAnim, null>, number> = { roll: 0.9, cut: 1.3, press: 0.7 }
const SLICE = 1.2
const SPREAD = 0.45

/** A layer laid on the mat (0..4 × 0..4 local), popping in from its middle. */
function Layer({ bricks, y = 0 }: { bricks: Parameters<typeof BrickModel>[0]['bricks']; y?: number }) {
  return (
    <PopIn position={[0, y, 0]}>
      <BrickModel bricks={bricks} centered={false} position={[-2, 0, -2]} />
    </PopIn>
  )
}

/** One slice of the roll, lying with its round faces along X. */
function Slice() {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <BrickModel bricks={ROLL_SLICE} position={[0, -SLICE / 2, 0]} />
    </group>
  )
}

/** A maki on the mat: flat layers, then (rolled) a green roll of three slices, cut by the knife. */
function Maki({ cook, anim, onAnimDone }: { cook: Cook; anim: MatAnim; onAnimDone: () => void }) {
  const flat = useRef<THREE.Group>(null)
  const roll = useRef<THREE.Group>(null)
  const knife = useRef<THREE.Group>(null)
  const left = useRef<THREE.Group>(null)
  const right = useRef<THREE.Group>(null)
  const chops = useRef(0)
  const rolled = hasDone(cook, 'roll')
  const cut = hasDone(cook, 'cut')
  const filling = cook.filling

  // Rolling: the sheet shrinks toward the back while the roll grows and tumbles away from the kid.
  useTween(
    anim === 'roll',
    ANIM_SECONDS.roll,
    (t) => {
      const e = 1 - (1 - t) * (1 - t)
      if (flat.current) flat.current.scale.z = Math.max(0.001, 1 - e)
      const r = roll.current
      if (r) {
        r.position.z = 2 - 2 * e
        r.rotation.x = -e * Math.PI * 3
        const s = 0.35 + 0.65 * e
        r.scale.set(1, s, s)
      }
    },
    onAnimDone,
  )

  // Cutting: the knife chops twice (thunk!), and the slices part a little after each chop.
  useTween(
    anim === 'cut',
    ANIM_SECONDS.cut,
    (t) => {
      if (t < 0.05) chops.current = 0
      const k = knife.current
      const half = t < 0.5 ? 0 : 1
      const local = (t - half * 0.5) / 0.5
      if (k) {
        k.position.x = half === 0 ? -SLICE / 2 : SLICE / 2
        k.position.y = 1.2 + 2.6 * (1 - Math.sin(Math.min(1, local) * Math.PI))
      }
      if (chops.current === 0 && t >= 0.25) {
        chops.current = 1
        thunk()
      }
      if (chops.current === 1 && t >= 0.75) {
        chops.current = 2
        thunk()
      }
      const a = left.current
      const c = right.current
      if (a) a.position.x = -SLICE - (t >= 0.25 ? SPREAD * Math.min(1, (t - 0.25) * 8) : 0)
      if (c) c.position.x = SLICE + (t >= 0.75 ? SPREAD * Math.min(1, (t - 0.75) * 8) : 0)
    },
    onAnimDone,
  )

  const showFlat = !rolled || anim === 'roll'
  const showRoll = rolled && (!cut || anim === 'cut')
  return (
    <>
      {showFlat && (
        // Anchored at the mat's back edge, so the sheet shrinks backward while rolling.
        <group ref={flat} position={[0, MAT_TOP, -2]}>
          <group position={[0, 0, 2]}>
            {hasDone(cook, 'seaweed') && <Layer bricks={SHEET} />}
            {hasDone(cook, 'rice') && <Layer bricks={RICE_LAYER} />}
            {hasDone(cook, 'filling') && filling && <Layer bricks={fillingLayer(filling)} />}
          </group>
        </group>
      )}
      {showRoll && (
        <group ref={roll} position={[0, MAT_TOP + 1, 0]}>
          <group ref={left} position={[-SLICE, 0, 0]}>
            <Slice />
          </group>
          <Slice />
          <group ref={right} position={[SLICE, 0, 0]}>
            <Slice />
          </group>
        </group>
      )}
      {anim === 'cut' && (
        <group ref={knife} position={[-SLICE / 2, 3.8, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <group rotation={[Math.PI / 2, 0, 0]}>
            <BrickModel bricks={KNIFE} />
          </group>
        </group>
      )}
    </>
  )
}

/** Nigiri on the mat: two rice blocks, the fish on top, then a big squishy press. */
function Nigiri({ cook, anim, onAnimDone }: { cook: Cook; anim: MatAnim; onAnimDone: () => void }) {
  const body = useRef<THREE.Group>(null)
  useTween(
    anim === 'press',
    ANIM_SECONDS.press,
    (t) => {
      const g = body.current
      if (!g) return
      const s = Math.sin(t * Math.PI) * Math.exp(-t * 1.5)
      g.scale.set(1 + s * 0.35, 1 - s * 0.55, 1 + s * 0.35)
    },
    () => {
      body.current?.scale.set(1, 1, 1)
      onAnimDone()
    },
  )
  const filling = cook.filling
  return (
    <group ref={body} position={[0, MAT_TOP, 0]}>
      {hasDone(cook, 'rice') && <Layer bricks={NIGIRI_RICE} />}
      {hasDone(cook, 'filling') && filling && <Layer bricks={nigiriTopping(filling)} />}
    </group>
  )
}

/** What is on the mat now, with the roll / cut / press animations. Hidden once the plate is up. */
export default function Dish({ cook, anim, onAnimDone }: { cook: Cook; anim: MatAnim; onAnimDone: () => void }) {
  return cook.order.kind === 'maki' ? <Maki cook={cook} anim={anim} onAnimDone={onAnimDone} /> : <Nigiri cook={cook} anim={anim} onAnimDone={onAnimDone} />
}
