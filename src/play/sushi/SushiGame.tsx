import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { coin, pop, success, thunk, whoosh } from '../../audio/sfx'
import {
  BrickModel,
  CustomerQueue,
  DragArena,
  DragItem,
  DropTarget,
  GameStage,
  HintHand,
  OrderBubble,
  ProgressBar,
  RoundIntro,
  RoundSummary,
  STAGE,
  Tappable,
  useRound,
  type GameSceneProps,
  type Mood,
  type OrderItem,
  type StageCamera,
} from '../kit'
import { EaseY, PopIn } from './anim'
import { flyCoins } from './coinBurst'
import Dish, { type MatAnim } from './Dish'
import { LANTERN, MAT, PLACEMAT, RICE_TOP, SIGN, SOURCE, SOY_BOTTLE, STOOL, dishBricks, piecesOf } from './food'
import {
  coinsFor,
  cookStep,
  currentStep,
  generateOrders,
  hintFor,
  newCook,
  orderKey,
  pickCustomers,
  type Cook,
  type ItemId,
  type Order,
  type TargetId,
} from './logic'
import { useSushiT } from './strings'
import './sushi.css'

/**
 * 🍣 The sushi restaurant (`sushi`). A customer walks in, sits at the bar and orders by picture: a
 * maki (salmon, cucumber or tuna) or a nigiri. The kid makes it on the bamboo mat:
 * - maki: drag seaweed → rice → the filling, tap to roll, tap to cut (chop chop);
 * - nigiri: drag rice → the fish, tap to press;
 * then drags the plate to the customer, who eats it piece by piece, hops for joy and pays coins
 * that fly into the round's coin pill. Four customers make a round, ending on the kit's summary.
 * No fail state: a wrong filling just makes the customer shake their head.
 */

type Vec3 = [number, number, number]
type SourceId = Exclude<ItemId, 'plate'>

const CUSTOMERS_PER_ROUND = 4
const TOP = STAGE.counterTop
/** Plates and the dish sit on top of the mat / placemat (one plate thick). */
const ON_MAT = 0.45
const SOURCES: readonly SourceId[] = ['seaweed', 'rice', 'salmon', 'cucumber', 'tuna']
const ITEM_SCALE = 1.35
const BITE_MS = 380
/** Customers are drawn this much bigger than the food. */
const FIG_SCALE = 1.9
const CUSTOMER_Z = -4.8

interface Layout {
  camera: StageCamera
  /** Front edge of the counter (z). */
  front: number
  mat: Vec3
  place: Vec3
  items: Record<SourceId, Vec3>
  /** Where the order bubble sits beside the customer's head (in the customer's units). */
  bubble: Vec3
  /** The shop sign's x on the wall. */
  signX: number
}

/** Tablets and landscape phones: one long row on the counter. */
const WIDE: Layout = {
  camera: { position: [0, 22, 19], target: [0, 2.6, -1.3], fov: 40, fitWidth: 31 },
  front: 5.8,
  mat: [-2.4, TOP, 2.9],
  place: [5, TOP, -0.2],
  items: { seaweed: [-11, TOP, 3.4], rice: [-7.6, TOP, 3.4], salmon: [3.2, TOP, 3.9], cucumber: [6.6, TOP, 3.9], tuna: [10, TOP, 3.9] },
  bubble: [1.7, -1.1, 0],
  signX: -6.5,
}

/** Portrait phones: a deeper counter, ingredients on a front row. */
const TALL: Layout = {
  camera: { position: [0, 33, 19], target: [0, 2.4, 1.4], fov: 40, fitWidth: 14.5 },
  front: 15,
  mat: [-2.4, TOP, 1.9],
  place: [3.4, TOP, -0.6],
  items: { seaweed: [-4.4, TOP, 6.6], rice: [-0.8, TOP, 6.6], salmon: [-4.4, TOP, 10], cucumber: [-0.8, TOP, 10], tuna: [2.8, TOP, 10] },
  bubble: [-1.5, -1.1, 0],
  signX: -4.5,
}

const PORTRAIT = '(max-aspect-ratio: 4/5)'

function usePortrait(): boolean {
  const [portrait, setPortrait] = useState(() => typeof window !== 'undefined' && window.matchMedia(PORTRAIT).matches)
  useEffect(() => {
    const m = window.matchMedia(PORTRAIT)
    const on = () => setPortrait(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return portrait
}

const above = (p: Vec3, dy: number): Vec3 => [p[0], p[1] + dy, p[2]]

/** The room: a warm wooden sushi bar with its sign, lanterns, stools and a soy sauce bottle. */
function SushiBar({ layout }: { layout: Layout }) {
  const { front, place } = layout
  const depth = front - STAGE.counterBack
  const midZ = (front + STAGE.counterBack) / 2
  // Empty stools along the bar (the customer's own one is hidden by them).
  const stools = [place[0] - 7, place[0] + 7, place[0] - 14]
  return (
    <group>
      {/* The counter: a dark wooden body under a light wood top. */}
      <mesh position={[0, (TOP - 0.4) / 2, midZ]}>
        <boxGeometry args={[36, TOP - 0.4, depth]} />
        <meshStandardMaterial color="#8a5a35" />
      </mesh>
      <mesh position={[0, TOP - 0.2, midZ]}>
        <boxGeometry args={[36.4, 0.4, depth + 0.4]} />
        <meshStandardMaterial color="#f1d7a6" />
      </mesh>
      {/* A red trim along the kid's edge. */}
      <mesh position={[0, TOP - 0.55, front + 0.25]}>
        <boxGeometry args={[36.4, 0.3, 0.1]} />
        <meshStandardMaterial color="#c91a09" />
      </mesh>
      {stools.map((x) => (
        <BrickModel key={x} bricks={STOOL} position={[x, 0, CUSTOMER_Z]} scale={1.2} />
      ))}
      <BrickModel bricks={SIGN} position={[layout.signX, 3.2, STAGE.wallZ + 0.6]} scale={1.3} />
      <BrickModel bricks={LANTERN} position={[-13, 4.5, STAGE.wallZ + 1.5]} scale={1.1} />
      <BrickModel bricks={LANTERN} position={[13, 4.5, STAGE.wallZ + 1.5]} scale={1.1} />
      <BrickModel bricks={SOY_BOTTLE} position={[place[0] + 5.8, TOP, place[2] - 1]} scale={1.3} />
    </group>
  )
}

/** A soft yellow ring on the counter under what the kid should use next (static: no frames). */
function NextRing({ at, radius = 2 }: { at: Vec3; radius?: number }) {
  return (
    <mesh position={[at[0], TOP + 0.03, at[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius * 0.82, radius, 40]} />
      <meshBasicMaterial color="#ffd500" transparent opacity={0.85} depthWrite={false} />
    </mesh>
  )
}

/** World → page coordinates, for the flying coins and the e2e hook. */
type Project = (p: Vec3) => { x: number; y: number }
const tmp = new THREE.Vector3()

function Projector({ onReady }: { onReady: (project: Project) => void }) {
  const camera = useThree((s) => s.camera)
  const el = useThree((s) => s.gl.domElement)
  useEffect(() => {
    onReady((p) => {
      const r = el.getBoundingClientRect()
      tmp.set(p[0], p[1], p[2]).project(camera)
      return { x: r.left + ((tmp.x + 1) / 2) * r.width, y: r.top + ((1 - tmp.y) / 2) * r.height }
    })
  }, [camera, el, onReady])
  return null
}

/** What the e2e test reads (dev builds only). */
interface SushiProbe {
  point: (name: SourceId | 'mat' | 'customer' | 'plate') => { x: number; y: number } | null
  state: () => { phase: string; customer: number; step: string | null; ready: boolean; coins: number; kind: string; filling: string }
}

function useTimers(): (fn: () => void, ms: number) => void {
  const timers = useRef<number[]>([])
  useEffect(() => {
    const list = timers.current
    return () => {
      for (const t of list) window.clearTimeout(t)
    }
  }, [])
  return useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])
}

function newRoundPlan(): { orders: Order[]; customers: string[] } {
  return { orders: generateOrders(CUSTOMERS_PER_ROUND), customers: pickCustomers(CUSTOMERS_PER_ROUND) }
}

export default function SushiGame({ gameId, onExit }: GameSceneProps) {
  const t = useSushiT()
  const round = useRound({ gameId, customers: CUSTOMERS_PER_ROUND })
  const portrait = usePortrait()
  const layout = portrait ? TALL : WIDE
  const later = useTimers()
  /** Cancels the coin flight in progress (leaving the game or starting over ends it). */
  const cancelFlight = useRef<(() => void) | null>(null)
  useEffect(() => () => cancelFlight.current?.(), [])

  const [plan, setPlan] = useState(newRoundPlan)
  const [cook, setCook] = useState<Cook>(() => newCook(plan.orders[0]))
  const [arrived, setArrived] = useState(-1)
  const [mood, setMood] = useState<Mood>('idle')
  const [anim, setAnim] = useState<MatAnim>(null)
  const [eating, setEating] = useState(false)
  const [eaten, setEaten] = useState(0)
  const [plateKey, setPlateKey] = useState(0)
  const [respawn, setRespawn] = useState<Record<SourceId, number>>({ seaweed: 0, rice: 0, salmon: 0, cucumber: 0, tuna: 0 })
  const [banked, setBanked] = useState(0)

  const order = cook.order
  const step = currentStep(cook)
  const busy = anim !== null || eating
  const ready = round.phase === 'serving' && arrived === round.customer && !busy
  const tapStep = step === 'roll' || step === 'cut' || step === 'press' ? step : null
  const plateUp = (step === 'serve' && anim === null) || eating
  const coinsShown = Math.max(banked, round.coins)

  const project = useRef<Project | null>(null)
  const onProjector = useCallback((p: Project) => void (project.current = p), [])
  const coinLayer = useRef<HTMLDivElement>(null)
  const tally = useRef<HTMLSpanElement>(null)

  const orderItems = useMemo<OrderItem[]>(
    () => [
      { key: `sushi-${orderKey(order)}`, bricks: dishBricks(order) },
      { key: `sushi-src-${order.filling}`, bricks: SOURCE[order.filling] },
    ],
    [order],
  )

  /** The customer is done: pay, and the next one comes in with a new order. */
  const nextCustomer = (served: Cook) => {
    const next = round.customer + 1
    round.serve(coinsFor(served.mistakes))
    setMood('idle')
    setEating(false)
    setEaten(0)
    setPlateKey((k) => k + 1)
    setCook(newCook(plan.orders[next] ?? plan.orders[0]))
  }

  /** The plate reached the customer: they eat piece by piece, hop for joy and pay. */
  const eat = (served: Cook) => {
    setEating(true)
    success()
    const pieces = piecesOf(served.order)
    for (let i = 1; i <= pieces; i++) {
      later(() => {
        setEaten(i)
        pop()
      }, BITE_MS * i + 200)
    }
    const paid = BITE_MS * pieces + 450
    later(() => {
      setMood('happy')
      const layer = coinLayer.current
      const pill = tally.current
      const from = project.current?.([layout.place[0], 6.5, CUSTOMER_Z])
      const count = coinsFor(served.mistakes)
      if (layer && pill && from) {
        cancelFlight.current?.()
        cancelFlight.current = flyCoins(layer, from, pill, count, () => {
          setBanked((b) => b + 1)
          coin()
        })
      } else setBanked((b) => b + count)
    }, paid)
    later(() => nextCustomer(served), paid + 1900)
  }

  const drop = (item: ItemId, target: string | null): boolean => {
    if (!ready) return false
    const { cook: next, result } = cookStep(cook, { type: 'drop', item, target: target as TargetId | null })
    if (result === 'notNow') return false
    setCook(next)
    if (result === 'wrong') {
      round.mistake()
      setMood('no')
      later(() => setMood('idle'), 1000)
      return false
    }
    if (result === 'served') {
      eat(next)
      return true
    }
    // The ingredient is now a layer on the mat; a fresh one pops back on the counter.
    if (item !== 'plate') setRespawn((r) => ({ ...r, [item]: r[item] + 1 }))
    return true
  }

  const tap = () => {
    if (!ready || !tapStep) return
    const { cook: next, result } = cookStep(cook, { type: 'tap', tool: tapStep })
    if (result !== 'ok') return
    setCook(next)
    setAnim(tapStep)
    if (tapStep === 'roll') whoosh()
    if (tapStep === 'press') thunk()
  }

  const again = () => {
    cancelFlight.current?.()
    cancelFlight.current = null
    const fresh = newRoundPlan()
    setPlan(fresh)
    setCook(newCook(fresh.orders[0]))
    setArrived(-1)
    setBanked(0)
    setPlateKey((k) => k + 1)
    round.again()
  }

  // The pointing hand: what to drag (from where to where) or where to tap.
  const hint = hintFor(cook)
  // Stable paths (the queue restarts a walk when they change), in the scaled customers' units.
  const walk = useMemo(
    () => ({
      spot: [layout.place[0] / FIG_SCALE, CUSTOMER_Z / FIG_SCALE] as [number, number],
      from: [-24 / FIG_SCALE, (CUSTOMER_Z - 2.5) / FIG_SCALE] as [number, number],
      to: [24 / FIG_SCALE, (CUSTOMER_Z - 2.5) / FIG_SCALE] as [number, number],
    }),
    [layout],
  )
  const matTop = useMemo(() => above(layout.mat, ON_MAT), [layout])
  const placeTop = useMemo(() => above(layout.place, ON_MAT), [layout])
  const targetPos = (to: TargetId): Vec3 => (to === 'mat' ? matTop : placeTop)
  const hintAt: Vec3 = !hint ? matTop : 'tap' in hint ? above(layout.mat, 1.2) : hint.drag === 'plate' ? matTop : above(layout.items[hint.drag], 1)
  const hintTo = hint && 'drag' in hint ? targetPos(hint.to) : undefined
  const nextItem = hint && 'drag' in hint && hint.drag !== 'plate' ? hint.drag : null

  // The e2e hook (dev only): where things are on screen, and the game state.
  const probe = useRef<SushiProbe['state']>(() => ({ phase: '', customer: 0, step: null, ready: false, coins: 0, kind: '', filling: '' }))
  useEffect(() => {
    probe.current = () => ({ phase: round.phase, customer: round.customer, step, ready, coins: coinsShown, kind: order.kind, filling: order.filling })
  })
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __btSushi?: SushiProbe }
    const points = { ...layout.items, mat: matTop, customer: placeTop, plate: matTop } as Record<string, Vec3>
    w.__btSushi = {
      point: (name) => (project.current && points[name] ? project.current(above(points[name], name === 'mat' || name === 'plate' || name === 'customer' ? 0.3 : 1)) : null),
      state: () => probe.current(),
    }
    return () => void delete w.__btSushi
  }, [layout, matTop, placeTop])

  return (
    <>
      <GameStage camera={layout.camera} backdrop={{ floor: '#d9b98c', wall: '#f6e7c8' }} counter={false} background="#f6e7c8">
        <Projector onReady={onProjector} />
        <SushiBar layout={layout} />
        <DragArena>
          {/* Customers are drawn bigger than life (they matter most), and sit down once at the bar. */}
          <group scale={FIG_SCALE}>
            <EaseY y={arrived === round.customer && round.phase === 'serving' ? -0.25 : 0}>
              <CustomerQueue
                customers={plan.customers}
                current={round.phase === 'intro' ? plan.customers.length : round.customer}
                spot={walk.spot}
                from={walk.from}
                to={walk.to}
                mood={mood}
                onArrive={setArrived}
                above={<OrderBubble items={orderItems} done={eating} position={layout.bubble} />}
              />
            </EaseY>
          </group>

          {/* The customer's place: a placemat with chopsticks and soy sauce. */}
          <DropTarget id="customer" position={placeTop} radius={3.8}>
            <BrickModel bricks={PLACEMAT} position={[-4, -ON_MAT, -2]} centered={false} />
          </DropTarget>

          {/* The bamboo mat, where the sushi is made; tap it to roll, cut or press. */}
          <DropTarget id="mat" position={matTop} radius={3.4}>
            <BrickModel bricks={MAT} position={[0, -ON_MAT, 0]} />
            <group position={[0, -ON_MAT, 0]}>
              <Tappable onTap={tap} hitSize={[6.5, 3, 5.5]} disabled={!ready || !tapStep}>
                {!plateUp && <Dish cook={cook} anim={anim} onAnimDone={() => setAnim(null)} />}
              </Tappable>
            </group>
          </DropTarget>

          {nextItem && ready && <NextRing at={layout.items[nextItem]} />}
          {SOURCES.map((id) => (
            <DragItem key={`${id}-${respawn[id]}`} id={id} position={layout.items[id]} grabSize={[3.2, 2.2, 3.2]} disabled={!ready} onDrop={(target) => drop(id, target)}>
              <PopIn>
                <BrickModel bricks={SOURCE[id]} scale={ITEM_SCALE} />
                {id === 'rice' && <BrickModel bricks={RICE_TOP} position={[0, 1.2 * ITEM_SCALE, 0]} scale={[ITEM_SCALE * 0.9, ITEM_SCALE * 0.4, ITEM_SCALE * 0.9]} />}
              </PopIn>
            </DragItem>
          ))}

          {plateUp && (
            <DragItem key={`plate-${plateKey}`} id="plate" position={matTop} grabSize={[7, 3, 5]} lift={1.2} disabled={!ready} onDrop={(target) => drop('plate', target)}>
              <PopIn>
                <BrickModel bricks={dishBricks(order, eaten)} />
              </PopIn>
            </DragItem>
          )}

          <HintHand at={hintAt} to={hintTo} active={ready && hint !== null} resetKey={`${round.customer}-${step}`} />
        </DragArena>
      </GameStage>

      <div className="bt-play-hud-top bt-sushi-hud">
        <ProgressBar done={round.customer} total={round.total} icon="🍣" />
        <span ref={tally} className="bt-sushi-tally" data-testid="sushi-coins" data-coins={coinsShown} role="status" aria-label={`${t('sushiCoins')}: ${coinsShown}`}>
          <span aria-hidden="true">🪙</span>
          <span key={coinsShown} className="bt-sushi-tally-num">
            {coinsShown}
          </span>
        </span>
      </div>
      <div ref={coinLayer} className="bt-sushi-coin-layer" aria-hidden="true" />

      {round.phase === 'intro' && <RoundIntro icon="🍣" onStart={round.start} />}
      {round.phase === 'summary' && <RoundSummary outcome={round.outcome} onAgain={again} onExit={onExit} />}
    </>
  )
}
