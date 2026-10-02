import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react'
import { Html } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { coin, paint, success, thunk, whoosh } from '../../audio/sfx'
import { COLORS } from '../../core/colors'
import { useApp } from '../../state/useApp'
import { useT } from '../../ui/i18n'
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
  Tappable,
  useIdle,
  useRound,
  type GameSceneProps,
  type Mood,
  type OrderItem,
  type StageCamera,
} from '../kit'
import { PopIn, Tilt, Travel, useOvenGlow, useWhirl } from './anim'
import {
  CUSTOMERS_PER_ROUND,
  FROSTINGS,
  FROSTING_COLOR,
  INGREDIENTS,
  MIX_TAPS,
  SHAPES,
  TOPPINGS,
  cakeReducer,
  makeOrders,
  missingTopping,
  newCake,
  nextIngredient,
  pickCustomers,
  rewardFor,
  slotsFor,
  type Frosting,
  type Ingredient,
  type Shape,
  type Topping,
} from './logic'
import {
  BOWL_BRICKS,
  INGREDIENT_BRICKS,
  OVEN_BRICKS,
  OVEN_SIZE,
  SPONGE_PLATES,
  STAND_BRICKS,
  STAND_TOP,
  TOPPING_BRICKS,
  TOPPING_SCALE,
  WHISK_HANDLE,
  WHISK_HEAD,
  SIGN_BRICKS,
  BOWL_SIZE,
  batterBricks,
  bowlContents,
  bowlKey,
  frostingBricks,
  frostingKey,
  mouldBricks,
  orderCakeBricks,
  orderPictureKey,
  spongeBricks,
} from './models'
import './bakery.css'

/**
 * 🎂 The bakery (`bakery`): customers order a cake by picture; the kid drags flour, egg and milk into
 * the bowl, taps to mix, pours the batter into a round or square tin, bakes it (a short timer and a
 * "ding"), picks the frosting and drags toppings onto it, then hands it over. Any cake makes the
 * customer happy and pays coins; one like the picture earns a bonus ⭐. No fail state.
 */

type Vec3 = [number, number, number]

/** Height of the bakery table's top (studs). */
const TOP = 2.4
/** Customers stand a little back from the table, so a cake never hides them. */
const SPOT: [number, number] = [0, -5.2]
const FROM: [number, number] = [-26, -8]
const TO: [number, number] = [26, -8]
/** Customers are drawn bigger than life, so small kids see their faces. */
const CUSTOMER_SCALE = 1.45
const scaled = (p: [number, number]): [number, number] => [
  p[0] / CUSTOMER_SCALE,
  p[1] / CUSTOMER_SCALE,
]
// Constants: CustomerQueue sends a customer back to the door whenever `from` changes identity.
const Q_SPOT = scaled(SPOT)
const Q_FROM = scaled(FROM)
const Q_TO = scaled(TO)
/** Tins are drawn at this size on the table (a cake rises in the oven to full size). */
const TIN_SCALE = 0.72
/** How long the cake bakes (ms). */
export const BAKE_MS = 3000

type Spot = Ingredient | Shape | Topping | 'bowl' | 'oven' | 'ovenDoor' | 'stand' | 'customer'

/**
 * Where everything stands. Wide screens get one long table; tall (portrait) ones a narrower,
 * deeper table with the supplies in a front row, so every piece stays big enough for small fingers.
 */
interface Layout {
  camera: StageCamera
  table: { x: number; back: number; front: number }
  signs: [number, number]
  P: Record<Spot, Vec3>
}

const at3 = (x: number, z: number): Vec3 => [x, TOP, z]

const WIDE: Layout = {
  camera: { position: [0, 36, 21], target: [0, 1, 0.5], fov: 38, fitWidth: 31 },
  table: { x: 15, back: -2.6, front: 8 },
  signs: [-9, 9],
  P: {
    flour: at3(-12.5, 4.5),
    egg: at3(-9, 4.5),
    milk: at3(-5.5, 4.5),
    bowl: at3(4, 3.5),
    round: at3(-10.8, 3.8),
    square: at3(-3.8, 3.8),
    oven: at3(11.5, -1.6),
    ovenDoor: at3(11.5, 1.5),
    stand: at3(0, 2.8),
    strawberry: at3(-11.5, 4.2),
    sprinkles: at3(-7, 4.8),
    candle: at3(7.5, 4.8),
    customer: at3(0, -1.6),
  },
}

const TALL: Layout = {
  camera: { position: [0, 44, 24], target: [0, 1, 5.5], fov: 38, fitWidth: 21 },
  table: { x: 10, back: -2.6, front: 15.5 },
  signs: [-6, 6],
  P: {
    flour: at3(-6.5, 11.5),
    egg: at3(0, 11.5),
    milk: at3(6.5, 11.5),
    bowl: at3(0, 5),
    round: at3(-4.6, 11.5),
    square: at3(4.6, 11.5),
    oven: at3(6.5, -1.6),
    ovenDoor: at3(6.5, 1.5),
    stand: at3(0, 5.2),
    strawberry: at3(-6.5, 12.6),
    sprinkles: at3(0, 13),
    candle: at3(6.5, 12.6),
    customer: at3(0, -1.6),
  },
}

const TALL_QUERY = '(max-aspect-ratio: 4/5)'
const subscribeTall = (cb: () => void) => {
  const mq = window.matchMedia?.(TALL_QUERY)
  mq?.addEventListener('change', cb)
  return () => mq?.removeEventListener('change', cb)
}
const isTall = () => window.matchMedia?.(TALL_QUERY).matches ?? false

/** The layout for the screen's shape (follows rotation). */
function useLayout(): Layout {
  return useSyncExternalStore(subscribeTall, isTall) ? TALL : WIDE
}
/** Height of the cake's top above the table (where toppings land). */
const CAKE_TOP = STAND_TOP + (SPONGE_PLATES + 1) * 0.4

const up = (p: Vec3, dy: number): Vec3 => [p[0], p[1] + dy, p[2]]

// ---- Screen positions (coins flying to the tally; e2e drags in dev) ---------------------------------

type Project = (p: Vec3) => { x: number; y: number }
const tmp = new THREE.Vector3()
/** Turns a stage point into page pixels (set by `Projector` inside the canvas; one game at a time). */
const screen: { project: Project | null } = { project: null }

function Projector() {
  const camera = useThree((s) => s.camera)
  const el = useThree((s) => s.gl.domElement)
  const size = useThree((s) => s.size)
  useEffect(() => {
    screen.project = (p) => {
      tmp.set(p[0], p[1], p[2]).project(camera)
      const r = el.getBoundingClientRect()
      return { x: r.left + ((tmp.x + 1) / 2) * r.width, y: r.top + ((1 - tmp.y) / 2) * r.height }
    }
    return () => {
      screen.project = null
    }
  }, [camera, el, size])
  return null
}

/** Named stage points for the dev handle (`window.__btBakery.at(name)`, e2e drags). */
const devPoints = (P: Layout['P']): Record<string, Vec3> => ({
  flour: up(P.flour, 1.2),
  egg: up(P.egg, 1.2),
  milk: up(P.milk, 1.2),
  bowl: up(P.bowl, 1),
  round: up(P.round, 0.6),
  square: up(P.square, 0.6),
  oven: up(P.ovenDoor, 1),
  cake: up(P.stand, CAKE_TOP - 0.5),
  strawberry: up(P.strawberry, 1),
  sprinkles: up(P.sprinkles, 0.8),
  candle: up(P.candle, 1.5),
  customer: up(P.customer, 1),
})

// ---- Small timers that end with the game ------------------------------------------------------------

function useLater() {
  const timers = useRef(new Set<number>())
  useEffect(() => {
    const set = timers.current
    return () => {
      for (const id of set) window.clearTimeout(id)
      set.clear()
    }
  }, [])
  return useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id)
      fn()
    }, ms)
    timers.current.add(id)
  }, [])
}

// ---- 3D pieces ----------------------------------------------------------------------------------------

/** The bakery's own long, deep table (the kit's counter is too shallow for baking). */
function Table({ table: TABLE }: { table: Layout['table'] }) {
  const depth = TABLE.front - TABLE.back
  const cz = (TABLE.back + TABLE.front) / 2
  return (
    <group>
      <mesh position={[0, (TOP - 0.4) / 2, cz]}>
        <boxGeometry args={[TABLE.x * 2, TOP - 0.4, depth]} />
        <meshStandardMaterial color="#FE8A18" />
      </mesh>
      <mesh position={[0, TOP - 0.2, cz]}>
        <boxGeometry args={[TABLE.x * 2 + 0.4, 0.4, depth + 0.4]} />
        <meshStandardMaterial color="#FFF4E0" />
      </mesh>
      {/* A pink stripe along the front, like a shop counter. */}
      <mesh position={[0, TOP * 0.55, TABLE.front + 0.01]}>
        <planeGeometry args={[TABLE.x * 2, 0.5]} />
        <meshStandardMaterial color="#FC97AC" />
      </mesh>
    </group>
  )
}

/** The bowl with whatever is in it; `spin` bumps make it whirl (mixing). */
function Bowl({
  added,
  mixes,
  egg,
  spin = 0,
}: {
  added: number
  mixes: number
  egg: boolean
  spin?: number
}) {
  const contents = bowlContents(bowlKey(added, mixes / MIX_TAPS, egg))
  const [contentsRef, whiskRef] = useWhirl(spin, 1.6)
  return (
    <group>
      <BrickModel bricks={BOWL_BRICKS} />
      <group ref={contentsRef}>
        <BrickModel
          bricks={contents}
          centered={false}
          position={[-BOWL_SIZE / 2, 0, -BOWL_SIZE / 2]}
        />
      </group>
      {added >= INGREDIENTS.length && (
        <group ref={whiskRef} position={[1.6, 1.4, 0]}>
          <BrickModel bricks={WHISK_HEAD} rotation={[Math.PI, 0, 0]} position={[0, 2.4, 0]} />
          <BrickModel bricks={WHISK_HANDLE} position={[0, 2.4, 0]} />
        </group>
      )}
    </group>
  )
}

/** A tin of `shape`, with batter in it when `full`. */
function Tin({ shape, full, rise = false }: { shape: Shape; full: boolean; rise?: boolean }) {
  return (
    <group scale={TIN_SCALE}>
      <BrickModel bricks={mouldBricks(shape)} centered={false} position={[-4, 0, -4]} />
      {full && (
        <PopIn delay={rise ? 0.35 : 0} duration={0.5}>
          <BrickModel bricks={batterBricks(shape)} centered={false} position={[-4, 0, -4]} />
        </PopIn>
      )}
    </group>
  )
}

/** The oven: bobs and glows while baking, with a timer bubble that fills up. */
function Oven({ position, baking, dinged }: { position: Vec3; baking: boolean; dinged: boolean }) {
  const { body, glass } = useOvenGlow(baking)
  return (
    <group position={position}>
      <group ref={body}>
        <BrickModel bricks={OVEN_BRICKS} />
        {/* The door's window (glass that glows while baking) and its handle. */}
        <mesh position={[0, 1.6, OVEN_SIZE.d / 2 + 0.02]}>
          <planeGeometry args={[4, 1.8]} />
          <meshStandardMaterial
            ref={glass}
            color="#3a2a22"
            emissive="#ff8a1a"
            emissiveIntensity={0}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[0, 2.85, OVEN_SIZE.d / 2 + 0.15]}>
          <boxGeometry args={[3, 0.25, 0.3]} />
          <meshStandardMaterial color="#C8C8C8" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
      {(baking || dinged) && (
        <Html position={[0, OVEN_SIZE.h + 3, 0]} center zIndexRange={[0, 0]} pointerEvents="none">
          <div
            className="bt-bakery-timer"
            data-testid="bakery-timer"
            data-done={dinged}
            style={{ '--bt-bake-ms': `${BAKE_MS}ms` } as CSSProperties}
          >
            <span className="bt-bakery-timer-face" aria-hidden="true">
              {dinged ? '🔔' : '⏲️'}
            </span>
          </div>
        </Html>
      )}
    </group>
  )
}

/** A cake on its stand: sponge, frosting (pops on when picked) and toppings (each pops on). */
function CakeView({
  shape,
  frosting,
  toppings,
}: {
  shape: Shape
  frosting: Frosting | null
  toppings: Array<Topping | null>
}) {
  const slots = slotsFor(shape)
  return (
    <group>
      <BrickModel bricks={STAND_BRICKS} />
      <group position={[0, STAND_TOP, 0]}>
        <BrickModel bricks={spongeBricks(shape)} centered={false} position={[-4, 0, -4]} />
        {frosting && (
          <PopIn key={frosting} drop={1.2} duration={0.3} position={[0, SPONGE_PLATES * 0.4, 0]}>
            <BrickModel
              bricks={frostingBricks(frostingKey(shape, frosting))}
              centered={false}
              position={[-4, 0, -4]}
            />
          </PopIn>
        )}
        {toppings.map((t, i) =>
          t ? (
            <PopIn
              key={`${i}-${t}`}
              drop={0.8}
              duration={0.3}
              position={[slots[i][0], (SPONGE_PLATES + 1) * 0.4, slots[i][1]]}
            >
              <BrickModel bricks={TOPPING_BRICKS[t]} scale={TOPPING_SCALE[t]} />
            </PopIn>
          ) : null,
        )}
      </group>
    </group>
  )
}

/** A topping's tray: a plate with a pile of spares beside the one to drag. */
function ToppingTray({ topping, position }: { topping: Topping; position: Vec3 }) {
  const s = TOPPING_SCALE[topping] * 1.4
  return (
    <group position={position}>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[2.4, 2.6, 0.2, 24]} />
        <meshStandardMaterial color="#FFFFFF" />
      </mesh>
      <BrickModel bricks={TOPPING_BRICKS[topping]} scale={s * 0.8} position={[-1.3, 0.2, -1]} />
      <BrickModel bricks={TOPPING_BRICKS[topping]} scale={s * 0.8} position={[1.3, 0.2, -1]} />
    </group>
  )
}

// ---- The game -----------------------------------------------------------------------------------------

interface Flyer {
  id: number
  x: number
  y: number
  dx: number
  dy: number
  delay: number
}

export default function BakeryGame({ gameId, onExit }: GameSceneProps) {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const later = useLater()
  const L = useLayout()
  const P = L.P
  const round = useRound({ gameId, customers: CUSTOMERS_PER_ROUND })
  const [roundNo, setRoundNo] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new cast and new orders each round
  const customers = useMemo(() => pickCustomers(CUSTOMERS_PER_ROUND), [roundNo])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new cast and new orders each round
  const orders = useMemo(() => makeOrders(CUSTOMERS_PER_ROUND), [roundNo])
  const [cake, dispatch] = useReducer(cakeReducer, undefined, newCake)
  const [arrived, setArrived] = useState(-1)
  const [mood, setMood] = useState<Mood>('idle')
  const [star, setStar] = useState(false)
  const [spin, setSpin] = useState(0)
  const [justAdded, setJustAdded] = useState<Ingredient | null>(null)
  const [pouring, setPouring] = useState<Shape | null>(null)
  const [dinged, setDinged] = useState(false)
  const [cakeOut, setCakeOut] = useState(false)
  const [carrying, setCarrying] = useState<string | null>(null)
  /** Toppings taken from each tray (a fresh one appears on that tray). */
  const [placed, setPlaced] = useState<Record<Topping, number>>({
    strawberry: 0,
    candle: 0,
    sprinkles: 0,
  })
  const [bank, setBank] = useState(0)
  const [flyers, setFlyers] = useState<Flyer[]>([])
  const flyId = useRef(0)

  const order = orders[Math.min(round.customer, orders.length - 1)]
  const serving = round.phase === 'serving'
  const ready = serving && arrived === round.customer && cake.step !== 'served'
  const custKey = `${roundNo}-${round.customer}`

  const orderItems = useMemo<OrderItem[]>(() => {
    const key = orderPictureKey(order)
    return [
      { key: `bakery-${key}`, bricks: orderCakeBricks(key) },
      ...order.toppings.map((tp) => ({ key: `bakery-top-${tp}`, bricks: TOPPING_BRICKS[tp] })),
    ]
  }, [order])

  // Dev handle for e2e drags: stage points in page pixels.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __btBakery?: unknown }
    const points = devPoints(P)
    w.__btBakery = {
      at: (name: string) => (screen.project && points[name] ? screen.project(points[name]) : null),
    }
    return () => void delete w.__btBakery
  }, [P])

  // ---- Steps ----

  const dropIngredient = (ingredient: Ingredient) => (target: string | null) => {
    if (target !== 'bowl' || !ready || cake.step !== 'ingredients') return false
    dispatch({ type: 'add', ingredient })
    setJustAdded(ingredient)
    later(() => setJustAdded((j) => (j === ingredient ? null : j)), 320)
    return true
  }

  const mix = () => {
    if (!ready || cake.step !== 'mix') return
    setSpin((s) => s + 1)
    dispatch({ type: 'mix' })
    if (cake.mixes + 1 >= MIX_TAPS) later(success, 350)
  }

  const dropBowl = (target: string | null) => {
    if (!ready || cake.step !== 'pour' || (target !== 'round' && target !== 'square')) return false
    setPouring(target)
    whoosh()
    return true
  }

  const poured = () => {
    if (pouring) dispatch({ type: 'pour', shape: pouring })
    setPouring(null)
  }

  const dropTin = (target: string | null) => {
    if (!ready || cake.step !== 'oven' || target !== 'oven') return false
    dispatch({ type: 'bake' })
    thunk()
    later(() => {
      coin() // ding!
      setDinged(true)
      setCakeOut(true)
      dispatch({ type: 'baked' })
      later(() => setDinged(false), 1200)
    }, BAKE_MS)
    return true
  }

  const frost = (frosting: Frosting) => {
    if (!ready || (cake.step !== 'frost' && cake.step !== 'decorate') || cakeOut) return
    paint()
    dispatch({ type: 'frost', frosting })
  }

  const slots = cake.shape ? slotsFor(cake.shape) : []
  const dropTopping = (topping: Topping) => (target: string | null) => {
    setCarrying(null)
    if (!ready || cake.step !== 'decorate' || !target?.startsWith('slot-')) return false
    dispatch({ type: 'top', slot: Number(target.slice(5)), topping })
    setPlaced((n) => ({ ...n, [topping]: n[topping] + 1 })) // a fresh one on the tray
    return true
  }

  const flyCoins = (coins: number) => {
    const from = screen.project?.([SPOT[0], 9, SPOT[1]])
    const tally = document
      .querySelector('[data-testid="bakery-round-coins"]')
      ?.getBoundingClientRect()
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!from || !tally || reduce) {
      setBank((b) => b + coins)
      return
    }
    const to = { x: tally.left + tally.width * 0.25, y: tally.top + tally.height / 2 }
    const list: Flyer[] = []
    for (let i = 0; i < coins; i++) {
      const x = from.x + (i - (coins - 1) / 2) * 22
      list.push({
        id: ++flyId.current,
        x,
        y: from.y,
        dx: to.x - x,
        dy: to.y - from.y,
        delay: i * 120,
      })
      later(
        () => {
          setBank((b) => b + 1)
          if (i < 5) coin()
        },
        850 + i * 120,
      )
    }
    setFlyers((f) => [...f, ...list])
    const ids = new Set(list.map((f) => f.id))
    later(() => setFlyers((f) => f.filter((x) => !ids.has(x.id))), 1100 + coins * 120)
  }

  const dropCake = (target: string | null) => {
    setCarrying(null)
    if (!ready || cake.step !== 'decorate' || target !== 'customer') return false
    const reward = rewardFor(cake, order)
    dispatch({ type: 'serve' })
    setMood('happy')
    setStar(reward.star)
    if (!reward.star) round.mistake() // only costs the ⭐ perfect round
    success()
    later(() => flyCoins(reward.coins), 350)
    later(() => {
      setMood('idle')
      setStar(false)
      dispatch({ type: 'reset' })
      round.serve(reward.coins)
    }, 2300)
    return true
  }

  const again = () => {
    setRoundNo((n) => n + 1)
    setArrived(-1)
    setBank(0)
    dispatch({ type: 'reset' })
    round.again()
  }

  // ---- Hints ----

  const hint = useMemo<{ at: Vec3; to?: Vec3 } | null>(() => {
    if (!ready || pouring || cakeOut) return null
    switch (cake.step) {
      case 'ingredients': {
        const next = nextIngredient(cake)
        return next ? { at: up(P[next], 1.5), to: up(P.bowl, 1.5) } : null
      }
      case 'mix':
        return { at: up(P.bowl, 1.6) }
      case 'pour':
        return { at: up(P.bowl, 1.6), to: up(P[order.shape], 0.6) }
      case 'oven':
        return cake.shape ? { at: up(P[cake.shape], 0.8), to: up(P.ovenDoor, 1) } : null
      case 'decorate': {
        const missing = missingTopping(cake, order)
        return missing
          ? { at: up(P[missing], 1.2), to: up(P.stand, CAKE_TOP) }
          : { at: up(P.stand, CAKE_TOP), to: up(P.customer, 1) }
      }
      default:
        return null
    }
  }, [ready, pouring, cakeOut, cake, order, P])
  const onCake = cake.toppings.filter((x) => x !== null).length
  const hintKey = `${custKey}-${cake.step}-${cake.added.length}-${onCake}`
  const paletteIdle = useIdle(ready && cake.step === 'frost' && !cakeOut, undefined, hintKey)

  const showPalette = ready && (cake.step === 'frost' || cake.step === 'decorate') && !cakeOut
  const egg = cake.added.includes('egg')

  return (
    <div
      className="bt-bakery"
      data-testid="bakery"
      data-step={cake.step}
      data-ready={ready}
      data-toppings={onCake}
      data-added={cake.added.length}
    >
      <GameStage
        camera={L.camera}
        counter={false}
        backdrop={{ wall: '#FBE3D4', floor: '#F2D8B5' }}
        background="#FFE9F0"
      >
        <Projector />
        <Table table={L.table} />
        <BrickModel bricks={SIGN_BRICKS} position={[L.signs[0], 0.6, -11.6]} />
        <BrickModel bricks={SIGN_BRICKS} position={[L.signs[1], 0.6, -11.6]} />
        <DragArena>
          <group scale={CUSTOMER_SCALE}>
            <CustomerQueue
              customers={customers}
              spot={Q_SPOT}
              from={Q_FROM}
              to={Q_TO}
              current={round.phase === 'intro' ? customers.length : round.customer}
              mood={mood}
              onArrive={setArrived}
              above={
                <>
                  <OrderBubble
                    items={orderItems}
                    position={[0, 1.2, 0]}
                    done={cake.step === 'served'}
                  />
                  {star && (
                    <Html position={[0, 4.4, 0]} center zIndexRange={[2, 2]} pointerEvents="none">
                      <span className="bt-bakery-star" data-testid="bakery-star" aria-hidden="true">
                        ⭐
                      </span>
                    </Html>
                  )}
                </>
              }
            />
          </group>

          <Oven position={P.oven} baking={cake.step === 'baking'} dinged={dinged} />

          {/* Ingredients, into the bowl. */}
          {cake.step === 'ingredients' &&
            INGREDIENTS.filter((i) => !cake.added.includes(i) || justAdded === i).map((i) => (
              <DragItem
                key={`${i}-${custKey}`}
                id={i}
                position={P[i]}
                grabSize={[3.4, 4.5, 3.4]}
                disabled={!ready || cake.added.includes(i)}
                onDrop={dropIngredient(i)}
              >
                <BrickModel bricks={INGREDIENT_BRICKS[i]} />
              </DragItem>
            ))}
          {cake.step === 'ingredients' && (
            <DropTarget id="bowl" position={P.bowl} radius={4.8}>
              <Bowl added={cake.added.length} mixes={0} egg={egg} />
            </DropTarget>
          )}

          {/* Mixing: tap, tap, tap. */}
          {cake.step === 'mix' && (
            <Tappable position={P.bowl} hitSize={[9, 5, 9]} onTap={mix} disabled={!ready}>
              <Bowl added={cake.added.length} mixes={cake.mixes} egg={egg} spin={spin} />
            </Tappable>
          )}

          {/* Pouring into a tin: its shape is the cake's. */}
          {cake.step === 'pour' && !pouring && (
            <DragItem
              key={`bowl-${custKey}`}
              id="bowl"
              position={P.bowl}
              grabSize={[9, 4, 9]}
              disabled={!ready}
              onDrop={dropBowl}
            >
              <Bowl added={cake.added.length} mixes={MIX_TAPS} egg={egg} />
            </DragItem>
          )}
          {cake.step === 'pour' &&
            SHAPES.map((s) => (
              <DropTarget key={s} id={s} position={P[s]} radius={3.6}>
                <Tin shape={s} full={pouring === s} rise />
              </DropTarget>
            ))}
          {pouring && (
            <Tilt position={up(P[pouring], 0.4)} onDone={poured}>
              <group position={[0, 0, 2.6]}>
                <Bowl added={cake.added.length} mixes={MIX_TAPS} egg={egg} />
              </group>
            </Tilt>
          )}

          {/* Into the oven. */}
          {cake.step === 'oven' && cake.shape && (
            <>
              <DragItem
                key={`tin-${custKey}`}
                id="tin"
                position={P[cake.shape]}
                grabSize={[6, 3, 6]}
                disabled={!ready}
                onDrop={dropTin}
              >
                <Tin shape={cake.shape} full />
              </DragItem>
              <DropTarget id="oven" position={P.ovenDoor} radius={5} />
            </>
          )}

          {/* Out of the oven onto the stand, then frosting. */}
          {cake.step === 'frost' && cake.shape && cakeOut && (
            <Travel
              from={up(P.oven, 1)}
              to={P.stand}
              height={5}
              duration={0.9}
              onDone={() => setCakeOut(false)}
            >
              <PopIn duration={0.5}>
                <CakeView shape={cake.shape} frosting={null} toppings={[]} />
              </PopIn>
            </Travel>
          )}
          {cake.step === 'frost' && cake.shape && !cakeOut && (
            <group position={P.stand}>
              <CakeView shape={cake.shape} frosting={null} toppings={[]} />
            </group>
          )}

          {/* Decorating, then handing it over. */}
          {(cake.step === 'decorate' || cake.step === 'served') && cake.shape && (
            <>
              <DragItem
                key={`cake-${custKey}`}
                id="cake"
                position={P.stand}
                grabSize={[9, 5, 9]}
                lift={1}
                disabled={!ready}
                onPickUp={() => setCarrying('cake')}
                onDrop={dropCake}
              >
                <CakeView shape={cake.shape} frosting={cake.frosting} toppings={cake.toppings} />
              </DragItem>
              {cake.step === 'decorate' &&
                carrying !== 'cake' &&
                slots.map(([x, z], i) => (
                  <DropTarget
                    key={i}
                    id={`slot-${i}`}
                    position={[P.stand[0] + x, TOP + CAKE_TOP, P.stand[2] + z]}
                    radius={1.6}
                    ring={false}
                  />
                ))}
              {carrying === 'cake' && (
                <DropTarget id="customer" position={P.customer} radius={4.5} />
              )}
              {carrying && carrying !== 'cake' && (
                <mesh position={up(P.stand, CAKE_TOP + 0.05)} rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[4.6, 5.2, 40]} />
                  <meshBasicMaterial
                    color="#ffd500"
                    transparent
                    opacity={0.85}
                    depthWrite={false}
                  />
                </mesh>
              )}
            </>
          )}
          {cake.step === 'decorate' &&
            TOPPINGS.map((tp) => (
              <group key={tp}>
                <ToppingTray topping={tp} position={P[tp]} />
                <DragItem
                  key={`${tp}-${custKey}-${placed[tp]}`}
                  id={tp}
                  position={up(P[tp], 0.2)}
                  grabSize={[3.4, 3.4, 3.4]}
                  disabled={!ready}
                  onPickUp={() => setCarrying(tp)}
                  onDrop={dropTopping(tp)}
                >
                  <BrickModel bricks={TOPPING_BRICKS[tp]} scale={TOPPING_SCALE[tp] * 1.4} />
                </DragItem>
              </group>
            ))}

          {hint && <HintHand at={hint.at} to={hint.to} active resetKey={hintKey} />}
        </DragArena>
      </GameStage>

      <div className="bt-play-hud-top bt-bakery-hud">
        <ProgressBar done={round.customer} total={round.total} icon="🎂" />
        <span
          className="bt-bakery-tally"
          data-testid="bakery-round-coins"
          data-coins={bank}
          aria-label={t('bakeryRoundCoins')}
        >
          <span aria-hidden="true">🪙</span> {bank}
        </span>
      </div>

      {showPalette && (
        <div
          className="bt-bakery-palette"
          role="group"
          aria-label={t('bakeryFrosting')}
          data-testid="bakery-palette"
        >
          {FROSTINGS.map((f) => {
            const color = COLORS[FROSTING_COLOR[f]]
            return (
              <button
                key={f}
                className="bt-btn bt-bakery-swatch"
                data-testid={`bakery-frost-${f}`}
                data-picked={cake.frosting === f}
                aria-label={color.name[lang]}
                aria-pressed={cake.frosting === f}
                style={{ '--bt-swatch': color.hex } as CSSProperties}
                onClick={() => frost(f)}
              >
                {paletteIdle && f === order.frosting && (
                  <span
                    className="bt-bakery-palette-hint"
                    data-testid="hint-hand"
                    aria-hidden="true"
                  >
                    👆
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {flyers.map((f) => (
        <span
          key={f.id}
          className="bt-bakery-coin"
          aria-hidden="true"
          style={
            {
              left: f.x,
              top: f.y,
              '--dx': `${f.dx}px`,
              '--dy': `${f.dy}px`,
              animationDelay: `${f.delay}ms`,
            } as CSSProperties
          }
        >
          🪙
        </span>
      ))}

      {round.phase === 'intro' && <RoundIntro icon="🎂" onStart={round.start} />}
      {round.phase === 'summary' && (
        <RoundSummary outcome={round.outcome} onAgain={again} onExit={onExit} />
      )}
    </div>
  )
}
