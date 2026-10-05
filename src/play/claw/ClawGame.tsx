import { Component, Suspense, use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { coin, fanfare, pop, success } from '../../audio/sfx'
import { useFrameRequest } from '../../render/frameDriver'
import { useApp } from '../../state/useApp'
import { useGame } from '../../state/useGame'
import Confetti from '../../ui/Confetti'
import { useT } from '../../ui/i18n'
import { BrickModel, GameStage, HintHand, RoundIntro, StickerBadge, Tappable, type GameSceneProps, type StageCamera } from '../kit'
import type { RoundOutcome } from '../rewards'
import { finishRound, playOf, usePlayData } from '../usePlay'
import Cabinet, { CABINET_CAMERA } from './Cabinet'
import { ClawRig, PRIZE_SIZE, clawLive, resetClawLive, type DropSeq } from './Claw'
import { collectPrize, ownedPrizes, type CollectResult } from './collection'
import {
  CHUTE,
  MAX_TRIES,
  applyTry,
  clampClaw,
  makePile,
  newClawRound,
  resolveTry,
  roundOver,
  seededRng,
  takeFromPile,
  triesLeft,
  type ClawRound,
  type PitPrize,
} from './logic'
import { BUTTON_AT, BUTTON_CAP, BUTTON_COLLAR, CABINET_COLORS, FRONT_PANE, JOYSTICK, JOYSTICK_AT, MACHINE_OFFSET, PIT_FLOOR, TRAY, gameCabinet, machineBricks } from './machine'
import { PrizeLoadError, PrizeModel, forgetPrizeModels, loadPrizeModels } from './PrizeModel'
import { PRIZE_BY_ID, PRIZE_COUNT } from './prizes'
import { useClawT } from './strings'
import TopView from './TopView'
import './claw.css'

/**
 * 🕹️ The claw machine (`claw`), in the arcade. A LEGO-brick claw machine stands in a small arcade
 * room; the kid moves the claw over the prize pit (hold ◀ ▶ ▲ ▼, or the arrow keys) and presses the
 * big red button (or Space). The claw drops, closes, lifts and carries the prize to the chute; it
 * comes out of the prize door, the kid taps it, it pops up big with confetti and its name and flies
 * to the 🏆 prize cabinet. Gift boxes hide an animal or a car and open at the door. Five free tries a
 * round; easy grabs, one in five slips back (see logic.ts). Aiming aids: a ring and a laser under the
 * claw, a halo round the prize a drop would grab, and a top-down view in the corner.
 * A kind the kid already owns turns into coins.
 *
 * The prizes are smooth 3D models (Kenney, CC0) fetched only when this game opens.
 */

type Vec3 = [number, number, number]

const MACHINE_CAMERA: StageCamera = { position: [0, 12.5, 31], target: [0, 6.8, 0], fov: 40, fitWidth: 22 }
/** Portrait phones: just the machine across the screen, a little lower (the pad sits under it). */
const MACHINE_CAMERA_TALL: StageCamera = { position: [0, 12.5, 31], target: [0, 5.6, 0], fov: 40, fitWidth: 14.5 }
const CABINET_CAMERA_TALL: StageCamera = { ...CABINET_CAMERA, fitWidth: 21 }
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
/** How long the prize shows big before flying to the cabinet, and the flight (ms). */
const REVEAL_MS = 1700
const FLY_MS = 600
/** A gift box wobbles this long before it opens (ms). */
const GIFT_MS = 1300

/** Page coordinates of a world point (for the e2e hook). */
type Project = (p: Vec3) => { x: number; y: number }
const tmp = new THREE.Vector3()
/** Scratch vectors for the reveal's frame loop (no allocation per frame). */
const rDir = new THREE.Vector3()
const rPos = new THREE.Vector3()
const rToward = new THREE.Vector3()

function Projector({ onReady, onInvalidate }: { onReady: (project: Project) => void; onInvalidate: (invalidate: () => void) => void }) {
  const camera = useThree((s) => s.camera)
  const el = useThree((s) => s.gl.domElement)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    onInvalidate(() => invalidate())
    // The first frames once the prizes are in (textures may still be uploading on the first one).
    invalidate()
    const id = window.setTimeout(() => invalidate(), 120)
    return () => window.clearTimeout(id)
  }, [invalidate, onInvalidate])
  useEffect(() => {
    onReady((p) => {
      const r = el.getBoundingClientRect()
      tmp.set(p[0], p[1], p[2]).project(camera)
      return { x: r.left + ((tmp.x + 1) / 2) * r.width, y: r.top + ((1 - tmp.y) / 2) * r.height }
    })
  }, [camera, el, onReady])
  return null
}

function useTimers(): (fn: () => void, ms: number) => void {
  const timers = useRef(new Set<number>())
  useEffect(() => {
    const live = timers.current
    return () => {
      for (const t of live) window.clearTimeout(t)
      live.clear()
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

/** The arcade room: a dark purple floor and walls with neon strips, and two brick game cabinets. */
function Room() {
  const cabinets = useMemo(() => CABINET_COLORS.map((c) => gameCabinet(c)), [])
  return (
    <group>
      <mesh position={[0, -0.05, 40]}>
        <boxGeometry args={[160, 0.1, 100]} />
        <meshStandardMaterial color="#45356e" />
      </mesh>
      <mesh position={[0, 30, -9]}>
        <boxGeometry args={[160, 62, 0.5]} />
        <meshStandardMaterial color="#2a2350" />
      </mesh>
      {[
        [4, '#ff4fd8'],
        [15.5, '#3ee6ff'],
      ].map(([y, c]) => (
        <mesh key={c as string} position={[0, y as number, -8.6]}>
          <boxGeometry args={[160, 0.35, 0.2]} />
          <meshBasicMaterial color={c as string} />
        </mesh>
      ))}
      <BrickModel bricks={cabinets[0]} position={[-12, 0, -4]} rotation={[0, 0.35, 0]} scale={1.3} />
      <BrickModel bricks={cabinets[1]} position={[12, 0, -4]} rotation={[0, -0.35, 0]} scale={1.3} />
    </group>
  )
}

/** The machine's bricks, the joystick (tilting with the input) and the big red button. */
function Machine({ pressed, onButton, buttonOn }: { pressed: boolean; onButton: () => void; buttonOn: boolean }) {
  const bricks = useMemo(() => machineBricks(), [])
  const stick = useRef<THREE.Group>(null)
  const cap = useRef<THREE.Group>(null)
  useFrame(() => {
    const L = clawLive
    if (stick.current) {
      stick.current.rotation.z = -L.ix * 0.35
      stick.current.rotation.x = L.iz * 0.35
    }
    if (cap.current) cap.current.position.y = pressed ? 0.95 : 1.2
  })
  return (
    <group>
      <BrickModel bricks={bricks} centered={false} position={MACHINE_OFFSET} />
      {/* Inside the chute and behind the prize door: dark. */}
      <mesh position={[CHUTE.x, PIT_FLOOR - 1.6, CHUTE.z]}>
        <boxGeometry args={[2.9, 3, 2.9]} />
        <meshBasicMaterial color="#120d1f" />
      </mesh>
      <mesh position={FRONT_PANE.at}>
        <boxGeometry args={[FRONT_PANE.size[0], FRONT_PANE.size[1], 0.06]} />
        <meshStandardMaterial color="#e8f6ff" transparent opacity={0.12} roughness={0.05} metalness={0.1} depthWrite={false} />
      </mesh>
      <group ref={stick} position={JOYSTICK_AT}>
        <BrickModel bricks={JOYSTICK} />
      </group>
      <group position={BUTTON_AT}>
        <Tappable onTap={onButton} disabled={!buttonOn} hitSize={[2.6, 2.4, 2.6]}>
          <BrickModel bricks={BUTTON_COLLAR} />
          <group ref={cap} position={[0, 1.2, 0]}>
            <BrickModel bricks={BUTTON_CAP} />
          </group>
        </Tappable>
      </group>
    </group>
  )
}

/** The prizes lying in the pit; their groups are registered so the claw can carry one. */
function Pit({ pile, gltf, groups }: { pile: readonly PitPrize[]; gltf: GLTF; groups: MutableRefObject<Map<number, THREE.Group>> }) {
  return (
    <group>
      {pile.map((p) => (
        <PitItem key={p.id} prize={p} gltf={gltf} groups={groups} />
      ))}
    </group>
  )
}

function PitItem({ prize, gltf, groups }: { prize: PitPrize; gltf: GLTF; groups: MutableRefObject<Map<number, THREE.Group>> }) {
  const ref = useRef<THREE.Group>(null)
  // Placed here (not by a prop): the claw moves the group itself while it carries it.
  useLayoutEffect(() => {
    const g = ref.current
    if (!g) return
    g.position.set(prize.x, PIT_FLOOR, prize.z)
    const map = groups.current
    map.set(prize.id, g)
    return () => void map.delete(prize.id)
  }, [prize, groups])
  return (
    <group ref={ref}>
      <PrizeModel kind={prize.gift ?? prize.kind} gltf={gltf} scale={PRIZE_SIZE} rotation={[0, prize.rot, 0]} />
    </group>
  )
}

/** The won prize sitting at the prize door: it pops in, and a tap takes it. */
function TrayPrize({ kind, gltf, onTap }: { kind: string; gltf: GLTF; onTap: () => void }) {
  const g = useRef<THREE.Group>(null)
  const t = useRef(0)
  const [growing, setGrowing] = useState(true)
  useFrameRequest(growing)
  useFrame((_, delta) => {
    if (!g.current || !growing) return
    t.current = Math.min(1, t.current + delta / 0.35)
    const k = t.current
    g.current.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.35)
    if (k >= 1) setGrowing(false)
  })
  return (
    <group position={TRAY}>
      <Tappable onTap={onTap} hitSize={[3.4, 3.2, 3.4]}>
        <group ref={g}>
          <PrizeModel kind={kind} gltf={gltf} scale={1.5} rotation={[0, -0.3, 0]} />
        </group>
      </Tappable>
    </group>
  )
}

type RevealStage = 'box' | 'show' | 'fly'

/** The sparkles bursting out of an opened gift (CSS spreads them around the middle). */
const SPARKS = Array.from({ length: 10 }, (_, i) => (
  <i key={i} style={{ '--bt-spark-a': `${i * 36}deg` } as CSSProperties}>
    ✨
  </i>
))

/** Grows from 0 to 1 over `k` in 0..1 with a little overshoot. */
const popIn = (k: number) => (k >= 1 ? 1 : Math.sin(k * Math.PI * 0.75) / Math.sin(Math.PI * 0.75))

/**
 * The prize popping up big in front of the camera, spinning; then (`fly`) shrinking toward the 🏆
 * button on screen. A gift box comes first (`box`): it pops up and wobbles harder and harder, then
 * (`show`) its lid flies off, the box shrinks away and the animal or car inside rises out of it.
 */
function RevealPrize({ kind, gift, stage, gltf, target }: { kind: string; gift?: string; stage: RevealStage; gltf: GLTF; target: () => { x: number; y: number } | null }) {
  const wrap = useRef<THREE.Group>(null)
  const box = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  const lid = useRef<{ o: THREE.Object3D; y: number } | null>(null)
  const camera = useThree((s) => s.camera)
  const el = useThree((s) => s.gl.domElement)
  const clock = useRef({ box: 0, show: 0, fly: 0 })
  useFrameRequest(true)
  useFrame((_, delta) => {
    const w = wrap.current
    if (!w) return
    const dt = Math.min(delta, 0.05)
    const c = clock.current
    if (stage === 'box') c.box += dt
    else c.show += dt
    if (stage === 'fly') c.fly = Math.min(1, c.fly + dt / (FLY_MS / 1000))
    camera.getWorldDirection(rDir)
    // In front of the camera, a little under the middle.
    rPos.copy(camera.position).addScaledVector(rDir, 9)
    rPos.y -= 1.4
    let scale = 3.2
    if (stage === 'fly') {
      const f = c.fly * c.fly
      const tp = target()
      if (tp) {
        const r = el.getBoundingClientRect()
        rToward.set(((tp.x - r.left) / r.width) * 2 - 1, -((tp.y - r.top) / r.height) * 2 + 1, 0.5).unproject(camera)
        rToward.sub(camera.position).normalize().multiplyScalar(9).add(camera.position)
        rPos.lerp(rToward, f)
      }
      scale *= 1 - f * 0.9
    }
    w.position.copy(rPos)
    w.scale.setScalar(scale)
    const b = box.current
    if (b) {
      if (!lid.current) {
        const o = b.getObjectByName('lid')
        if (o) lid.current = { o, y: o.position.y }
      }
      const k = Math.min(1, c.box / 0.35)
      const shake = Math.min(1, Math.max(0, (c.box - 0.35) / 0.8))
      b.rotation.z = stage === 'box' ? Math.sin(c.box * 22) * 0.14 * shake : 0
      const away = Math.min(1, c.show / 0.45)
      b.scale.setScalar(Math.max(0.001, popIn(k) * (1 - away)))
      const l = lid.current
      if (l) {
        // The lid hops up (in the box's units) and tumbles off.
        l.o.position.y = l.y + (stage === 'box' ? 0 : c.show * 3.2)
        l.o.rotation.z = stage === 'box' ? 0 : c.show * 5
      }
    }
    const i = inner.current
    if (i) {
      const k = gift ? (stage === 'box' ? 0 : Math.min(1, c.show / 0.5)) : Math.min(1, c.show / 0.45)
      i.scale.setScalar(Math.max(0.001, popIn(k)))
      i.position.y = gift ? (1 - Math.min(1, k)) * 0.25 : 0
      i.rotation.y = Math.sin(c.show * 2.2) * 0.6
    }
  })
  return (
    <group ref={wrap} scale={0.01}>
      {gift && (
        <group ref={box} scale={0.001}>
          <PrizeModel kind={gift} gltf={gltf} />
        </group>
      )}
      <group ref={inner} scale={0.001}>
        <PrizeModel kind={kind} gltf={gltf} spin />
      </group>
    </group>
  )
}

/** The on-screen controls: a hold-to-move pad and the big red button. */
function Controls({ enabled, onDir, onDrop }: { enabled: boolean; onDir: (dir: 'l' | 'r' | 'u' | 'd', on: boolean) => void; onDrop: () => void }) {
  const t = useClawT()
  const button = (dir: 'l' | 'r' | 'u' | 'd', icon: string, label: string) => {
    const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      onDir(dir, true)
    }
    const up = () => onDir(dir, false)
    return (
      <button
        className={`bt-btn bt-claw-dir bt-claw-dir-${dir}`}
        data-testid={`claw-${dir}`}
        aria-label={label}
        disabled={!enabled}
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={up}
        onLostPointerCapture={up}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span aria-hidden="true">{icon}</span>
      </button>
    )
  }
  return (
    <div className="bt-claw-controls">
      <div className="bt-claw-pad">
        {button('u', '▲', t('clawBack'))}
        {button('l', '◀', t('clawLeft'))}
        {button('r', '▶', t('clawRight'))}
        {button('d', '▼', t('clawFront'))}
      </div>
      <button className="bt-btn bt-claw-drop" data-testid="claw-drop" aria-label={t('clawDrop')} disabled={!enabled} onClick={onDrop}>
        <span aria-hidden="true" />
      </button>
    </div>
  )
}

/** Tries left as five tokens. */
function Tokens({ left }: { left: number }) {
  const t = useClawT()
  return (
    <div className="bt-claw-tokens" data-testid="claw-tries" data-left={left} role="status" aria-label={`${t('clawTries')}: ${left}`}>
      {Array.from({ length: MAX_TRIES }, (_, i) => (
        <span key={i} className="bt-claw-token" data-used={i >= left}>
          🎟️
        </span>
      ))}
    </div>
  )
}

interface Summary {
  outcome: RoundOutcome
  won: string[]
  coins: number
  stickers: string[]
}

/** The end of a round: the prizes won, coins from duplicates, new stickers; 🏆, ← and 🔁. */
function ClawSummary({ summary, onAgain, onExit, onCabinet }: { summary: Summary; onAgain: () => void; onExit: () => void; onCabinet: () => void }) {
  const t = useT()
  const ct = useClawT()
  useEffect(() => {
    fanfare()
    if (summary.coins > 0) {
      const id = window.setTimeout(coin, 500)
      return () => window.clearTimeout(id)
    }
  }, [summary.coins])
  return (
    <div className="bt-play-overlay" data-testid="round-summary">
      <Confetti />
      <div className="bt-play-card bt-celebrate-card">
        <span className="bt-play-card-icon" aria-hidden="true">🎉</span>
        <div className="bt-claw-won" data-testid="claw-won" data-count={summary.won.length} aria-label={ct('clawWon')}>
          {summary.won.length === 0 ? <span aria-hidden="true">🎈</span> : summary.won.map((k, i) => <span key={i}>{PRIZE_BY_ID[k]?.icon}</span>)}
        </div>
        {summary.coins > 0 && (
          <span className="bt-play-earned" data-testid="round-coins" data-coins={summary.coins}>
            <span aria-hidden="true">🪙</span> +{summary.coins}
          </span>
        )}
        {summary.stickers.length > 0 && (
          <div className="bt-play-new-stickers" data-testid="round-stickers">
            {summary.stickers.map((id) => (
              <StickerBadge key={id} id={id} size="big" />
            ))}
          </div>
        )}
        <div className="bt-row">
          <button className="bt-btn bt-play-big" data-testid="round-back" aria-label={t('back')} onClick={onExit}>
            ←
          </button>
          <button className="bt-btn bt-play-big" data-testid="claw-summary-cabinet" aria-label={ct('clawCabinet')} onClick={onCabinet}>
            🏆
          </button>
          <button className="bt-btn bt-yes bt-play-big" data-testid="round-again" aria-label={t('playAgain')} onClick={onAgain}>
            🔁
          </button>
        </div>
      </div>
    </div>
  )
}

type Phase = 'intro' | 'aim' | 'busy' | 'tray' | 'reveal' | 'summary'

/** What the e2e test reads and drives (dev builds only). */
interface ClawProbe {
  state: () => { phase: Phase; tries: number; x: number; z: number; tray: string | null; trayGift: string | null; owned: number; pile: Array<{ id: number; kind: string; gift: string | null; x: number; z: number }> }
  moveTo: (x: number, z: number) => boolean
  drop: () => boolean
  /** Turns slips off (or back on), so a test's grab always holds. */
  noSlip: (on: boolean) => void
  point: (name: 'tray' | 'button') => { x: number; y: number } | null
}

let roundSeed = 1

function ClawPlay({ gameId, onExit }: GameSceneProps) {
  const gltf = use(loadPrizeModels())
  const t = useClawT()
  const lang = useApp((s) => s.lang)
  const play = usePlayData()
  const owned = ownedPrizes(play)
  const later = useTimers()
  const portrait = usePortrait()

  const [phase, setPhase] = useState<Phase>('intro')
  const [view, setView] = useState<'machine' | 'cabinet'>('machine')
  const [round, setRound] = useState<ClawRound>(newClawRound)
  const [pile, setPile] = useState<PitPrize[]>(() => makePile(seededRng(roundSeed++), ownedPrizes(playOf(useGame.getState().data))))
  const [seq, setSeq] = useState<DropSeq | null>(null)
  const [tray, setTray] = useState<{ kind: string; gift?: string; collect: CollectResult } | null>(null)
  const [reveal, setReveal] = useState<{ kind: string; gift?: string; stage: RevealStage } | null>(null)
  const [toast, setToast] = useState<{ key: number; kind: string; coins: number } | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [pressed, setPressed] = useState(false)
  const [moving, setMoving] = useState(false)
  const [bump, setBump] = useState(0)
  // A new kind on its way to the cabinet (the 🏆 count goes up when it lands there).
  const [arriving, setArriving] = useState<string | null>(null)
  const shelf = useMemo(() => owned.filter((k) => k !== arriving), [owned, arriving])

  // A fresh claw over the chute each time the game opens.
  useLayoutEffect(() => resetClawLive(), [])
  const held = useRef(new Set<'l' | 'r' | 'u' | 'd'>())
  const keys = useRef(new Set<'l' | 'r' | 'u' | 'd'>())
  const groups = useRef(new Map<number, THREE.Group>())
  /** What decides slips (the e2e hook can turn them off). */
  const slipRng = useRef<() => number>(Math.random)
  const roundCoins = useRef(0)
  const roundStickers = useRef<string[]>([])
  const trophy = useRef<HTMLButtonElement>(null)
  const project = useRef<Project | null>(null)
  const onProjector = useCallback((p: Project) => void (project.current = p), [])
  const redraw = useRef<() => void>(() => {})
  const onInvalidate = useCallback((f: () => void) => void (redraw.current = f), [])

  // The latest state for event handlers and the e2e hook (updated after each render).
  const latest = useRef({ phase, round, pile, tray, view })
  useEffect(() => {
    latest.current = { phase, round, pile, tray, view }
  })

  const updateInput = useCallback(() => {
    const dirs = new Set([...held.current, ...keys.current])
    const L = clawLive
    L.ix = (dirs.has('r') ? 1 : 0) - (dirs.has('l') ? 1 : 0)
    L.iz = (dirs.has('d') ? 1 : 0) - (dirs.has('u') ? 1 : 0)
    // Frames only while the claw actually moves (opposite directions cancel out).
    setMoving(L.ix !== 0 || L.iz !== 0)
  }, [])

  /** Lets go of every direction (a drop, a new round, the window losing focus). */
  const releaseInput = useCallback(() => {
    held.current.clear()
    keys.current.clear()
    updateInput()
  }, [updateInput])

  const onDir = useCallback(
    (dir: 'l' | 'r' | 'u' | 'd', on: boolean) => {
      if (on) held.current.add(dir)
      else held.current.delete(dir)
      updateInput()
    },
    [updateInput],
  )

  /** The next try, or the summary after the fifth. */
  const next = useCallback(
    (r: ClawRound) => {
      if (!roundOver(r)) {
        setPhase('aim')
        return
      }
      const outcome = finishRound(gameId, { customers: r.won.length, coins: 0, perfect: r.won.length === MAX_TRIES })
      setSummary({ outcome, won: r.won, coins: roundCoins.current, stickers: [...roundStickers.current, ...outcome.stickers] })
      setPhase('summary')
    },
    [gameId],
  )

  const drop = useCallback(() => {
    const { phase: ph, round: r, pile: p, view: v } = latest.current
    if (ph !== 'aim' || v !== 'machine' || roundOver(r)) return false
    // The pad goes disabled now: a held button may never see its pointerup (iPad), so let go here.
    releaseInput()
    const outcome = resolveTry(r, p, clawLive.x, clawLive.z, slipRng.current)
    const nextRound = applyTry(r, outcome)
    latest.current = { ...latest.current, phase: 'busy', round: nextRound }
    setRound(nextRound)
    setPhase('busy')
    setSeq((s) => ({ key: (s?.key ?? 0) + 1, outcome }))
    setPressed(true)
    later(() => setPressed(false), 220)
    return true
  }, [later, releaseInput])

  // The prize went down the chute: it is the kid's now (saved at once), shown at the prize door.
  const onChute = useCallback((prize: PitPrize) => {
    const collect = collectPrize(playOf(useGame.getState().data), prize.kind)
    useGame.getState().update((d) => ({ ...d, play: collect.play }))
    roundCoins.current += collect.coins
    roundStickers.current.push(...collect.stickers)
    setPile((p) => takeFromPile(p, prize.id))
    setTray({ kind: prize.kind, gift: prize.gift, collect })
    if (collect.isNew) setArriving(prize.kind)
    setPhase('tray')
    success()
  }, [])

  const onDone = useCallback(() => next(latest.current.round), [next])

  const takeTray = useCallback(() => {
    const cur = latest.current
    if (cur.phase !== 'tray' || !cur.tray) return false
    const { kind, gift, collect } = cur.tray
    latest.current = { ...cur, phase: 'reveal' }
    setTray(null)
    setPhase('reveal')
    // A gift box first wobbles, then opens on what is inside.
    const wait = gift ? GIFT_MS : 0
    setReveal({ kind, gift, stage: gift ? 'box' : 'show' })
    if (gift) {
      later(() => {
        setReveal({ kind, gift, stage: 'show' })
        success()
      }, GIFT_MS)
    }
    later(() => setReveal({ kind, gift, stage: 'fly' }), wait + REVEAL_MS)
    later(() => {
      setReveal(null)
      setArriving(null)
      setBump((b) => b + 1)
      pop()
      if (!collect.isNew) {
        setToast((tt) => ({ key: (tt?.key ?? 0) + 1, kind, coins: collect.coins }))
        coin()
        later(() => setToast(null), 2200)
      }
      next(latest.current.round)
    }, wait + REVEAL_MS + FLY_MS)
    return true
  }, [later, next])

  const again = () => {
    roundCoins.current = 0
    roundStickers.current = []
    setRound(newClawRound())
    setPile(makePile(seededRng(roundSeed++), ownedPrizes(playOf(useGame.getState().data))))
    setSummary(null)
    setSeq(null)
    resetClawLive()
    releaseInput()
    setPhase('aim')
  }

  // Arrow keys move, Space drops (or takes the prize at the door).
  useEffect(() => {
    const map: Record<string, 'l' | 'r' | 'u' | 'd'> = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd' }
    const onDown = (e: KeyboardEvent) => {
      if (map[e.code]) {
        e.preventDefault()
        keys.current.add(map[e.code])
        updateInput()
      } else if (e.code === 'Space') {
        e.preventDefault()
        if (!e.repeat && !drop()) takeTray()
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (map[e.code]) {
        keys.current.delete(map[e.code])
        updateInput()
      }
    }
    const release = releaseInput
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', release)
    }
  }, [drop, takeTray, updateInput, releaseInput])

  // The e2e hook (dev only).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __btClaw?: ClawProbe }
    w.__btClaw = {
      state: () => {
        const c = latest.current
        return {
          phase: c.phase,
          tries: triesLeft(c.round),
          x: clawLive.x,
          z: clawLive.z,
          tray: c.tray?.kind ?? null,
          trayGift: c.tray?.gift ?? null,
          owned: ownedPrizes(playOf(useGame.getState().data)).length,
          pile: c.pile.map((p) => ({ id: p.id, kind: p.kind, gift: p.gift ?? null, x: p.x, z: p.z })),
        }
      },
      moveTo: (x, z) => {
        if (latest.current.phase !== 'aim') return false
        const p = clampClaw(x, z)
        clawLive.x = p.x
        clawLive.z = p.z
        redraw.current()
        return true
      },
      drop,
      noSlip: (on) => void (slipRng.current = on ? () => 0.99 : Math.random),
      point: (name) => (project.current ? project.current(name === 'tray' ? [TRAY[0], TRAY[1] + 0.8, TRAY[2]] : [BUTTON_AT[0], BUTTON_AT[1] + 1.4, BUTTON_AT[2]]) : null),
    }
    return () => void delete w.__btClaw
  }, [drop])

  const aiming = phase === 'aim' && view === 'machine'
  const topView = view === 'machine' && (phase === 'aim' || phase === 'busy' || phase === 'tray')
  const trophyTarget = useCallback(() => {
    const r = trophy.current?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
  }, [])
  const camera = view === 'cabinet' ? (portrait ? CABINET_CAMERA_TALL : CABINET_CAMERA) : portrait ? MACHINE_CAMERA_TALL : MACHINE_CAMERA

  return (
    <>
      <div className="bt-claw" data-testid="claw" data-phase={phase} data-view={view} data-tries={triesLeft(round)} data-owned={owned.length}>
        <GameStage camera={camera} backdrop={false} background="#2a2350">
          <Projector onReady={onProjector} onInvalidate={onInvalidate} />
          <Room />
          <Machine pressed={pressed} onButton={drop} buttonOn={aiming} />
          <Pit pile={pile} gltf={gltf} groups={groups} />
          <ClawRig aiming={aiming && moving} seq={seq} prizeGroups={groups} onChute={onChute} onDone={onDone} pile={pile} showAim={aiming} />
          <TopView enabled={topView} />
          {tray && <TrayPrize key={`${tray.kind}-${round.used}`} kind={tray.gift ?? tray.kind} gltf={gltf} onTap={takeTray} />}
          {reveal && <RevealPrize key={round.used} kind={reveal.kind} gift={reveal.gift} stage={reveal.stage} gltf={gltf} target={trophyTarget} />}
          <HintHand at={[TRAY[0], TRAY[1] + 1.2, TRAY[2]]} active={phase === 'tray'} idleMs={2500} resetKey={round.used} />
          <HintHand at={[BUTTON_AT[0], BUTTON_AT[1] + 1.6, BUTTON_AT[2]]} active={phase === 'aim' && round.used === 0} idleMs={6000} resetKey={phase} />
          <Cabinet gltf={gltf} owned={shelf} />
        </GameStage>
      </div>

      {view === 'machine' && phase !== 'intro' && (
        <div className="bt-play-hud-top bt-claw-hud">
          <button ref={trophy} key={bump} className="bt-btn bt-claw-trophy" data-testid="claw-cabinet-open" data-count={shelf.length} aria-label={t('clawCabinet')} disabled={phase !== 'aim' && phase !== 'summary'} onClick={() => setView('cabinet')}>
            <span aria-hidden="true">🏆</span> {shelf.length}/{PRIZE_COUNT}
          </button>
          <Tokens left={triesLeft(round)} />
        </div>
      )}

      {topView && <div className="bt-claw-topview" data-testid="claw-topview" aria-hidden="true" />}

      {view === 'machine' && (phase === 'aim' || phase === 'busy' || phase === 'tray' || phase === 'reveal') && <Controls enabled={phase === 'aim'} onDir={onDir} onDrop={drop} />}

      {reveal && (
        <div className="bt-claw-reveal" data-testid="claw-reveal" data-stage={reveal.stage} data-kind={reveal.stage === 'box' ? '' : reveal.kind} aria-live="polite">
          {reveal.stage === 'show' && reveal.gift && <span className="bt-claw-sparkle" aria-hidden="true">{SPARKS}</span>}
          {reveal.stage === 'show' && <Confetti />}
          {reveal.stage === 'show' && <span className="bt-claw-reveal-name">{PRIZE_BY_ID[reveal.kind]?.name[lang]}</span>}
        </div>
      )}

      {toast && (
        <div key={toast.key} className="bt-claw-toast" data-testid="claw-toast" role="status" aria-label={t('clawDuplicate')}>
          <span aria-hidden="true">
            {PRIZE_BY_ID[toast.kind]?.icon} ✓{toast.coins > 0 ? ` → 🪙 +${toast.coins}` : ''}
          </span>
        </div>
      )}

      {view === 'cabinet' && (
        <div className="bt-claw-cabinet-ui" data-testid="claw-cabinet" data-owned={shelf.length}>
          <span className="bt-claw-cabinet-title">
            <span aria-hidden="true">🏆</span> {shelf.length}/{PRIZE_COUNT}
          </span>
          <button className="bt-btn bt-play-big" data-testid="claw-cabinet-back" aria-label={t('clawCabinet')} onClick={() => setView('machine')}>
            ←
          </button>
        </div>
      )}

      {phase === 'intro' && <RoundIntro icon="🕹️" onStart={() => setPhase('aim')} />}
      {phase === 'summary' && summary && view === 'machine' && <ClawSummary summary={summary} onAgain={again} onExit={onExit} onCabinet={() => setView('cabinet')} />}
    </>
  )
}

/** "Đang chuẩn bị máy gắp…": the prizes are downloading. */
function Loading() {
  const t = useClawT()
  return (
    <div className="bt-play-overlay" data-testid="claw-loading" role="status">
      <div className="bt-play-card">
        <span className="bt-play-card-icon bt-claw-loading-icon" aria-hidden="true">🕹️</span>
        <span className="bt-play-card-title">{t('clawLoading')}</span>
      </div>
    </div>
  )
}

/** The prizes could not be fetched (offline the first time): a friendly card, ← and 🔄. */
function Offline({ onExit, onRetry }: { onExit: () => void; onRetry: () => void }) {
  const t = useClawT()
  const tt = useT()
  return (
    <div className="bt-play-overlay" data-testid="claw-offline" role="alert">
      <div className="bt-play-card">
        <span className="bt-play-card-icon" aria-hidden="true">📶</span>
        <span className="bt-play-card-title">{t('clawOffline')}</span>
        <div className="bt-row">
          <button className="bt-btn bt-play-big" data-testid="claw-offline-back" aria-label={tt('back')} onClick={onExit}>
            ←
          </button>
          <button className="bt-btn bt-yes bt-play-big" data-testid="claw-offline-retry" aria-label={t('clawRetry')} onClick={onRetry}>
            🔄
          </button>
        </div>
      </div>
    </div>
  )
}

/** Catches the prizes' failed download only; any other error goes on to the app's scene boundary. */
class LoadBoundary extends Component<{ children: ReactNode; fallback: (retry: () => void) => ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown) {
    if (error instanceof PrizeLoadError) console.warn('bricktown: claw machine prizes failed to load', error.cause)
  }

  retry = () => {
    forgetPrizeModels()
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (error === null) return this.props.children
    if (error instanceof PrizeLoadError) return this.props.fallback(this.retry)
    throw error
  }
}

/** The game: its prizes load first (a loading card; a friendly card when offline the first time). */
export default function ClawGame(props: GameSceneProps) {
  return (
    <LoadBoundary fallback={(retry) => <Offline onExit={props.onExit} onRetry={retry} />}>
      <Suspense fallback={<Loading />}>
        <ClawPlay {...props} />
      </Suspense>
    </LoadBoundary>
  )
}
