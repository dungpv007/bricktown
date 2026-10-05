import { PRIZES } from './prizes'

/**
 * The claw machine's rules, pure (unit-tested; the scene only animates what they decide):
 * - the claw moves over the prize pit inside fixed bounds;
 * - a drop grabs the prize nearest the claw when its top is within a generous radius (easy!);
 * - at most one fun "slip" per round (the prize falls back mid-lift): never on the first or last try,
 *   about one time in four; the try after a slip is guaranteed (it grabs the nearest prize wherever
 *   the claw is);
 * - a round ("ván") is five free tries.
 *
 * Units are the scene's (studs), relative to the middle of the pit floor; +z is toward the kid.
 */

/** A random number in [0, 1). Injected so tests (and the pile) are deterministic. */
export type Rng = () => number

/** A small seeded generator (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Where the claw can go (its centre). */
export const PIT = { minX: -4, maxX: 4, minZ: -3, maxZ: 3 } as const
/** The prize chute (front right of the pit): where a won prize is dropped, and where the claw waits. */
export const CHUTE = { x: 3.5, z: 2.5 } as const
/** How close (studs, on the floor plane) the claw must be to a prize to grab it. */
export const GRAB_RADIUS = 1.5
export const MAX_TRIES = 5
export const SLIP_CHANCE = 0.25
/** The first try (1-based) that may slip. */
export const SLIP_FROM_TRY = 2

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** The claw position kept inside the pit. */
export function clampClaw(x: number, z: number): { x: number; z: number } {
  return { x: clamp(Number.isFinite(x) ? x : 0, PIT.minX, PIT.maxX), z: clamp(Number.isFinite(z) ? z : 0, PIT.minZ, PIT.maxZ) }
}

/** A prize lying in the pit. */
export interface PitPrize {
  /** Unique within the pile. */
  id: number
  kind: string
  x: number
  z: number
  /** Turn about the vertical axis (radians): mostly facing the kid. */
  rot: number
}

/** The pile's slots: a 4 x 3 grid, without the corner over the chute. */
const SLOTS: ReadonlyArray<[number, number]> = (() => {
  const out: Array<[number, number]> = []
  for (const z of [-2.4, 0, 2.4]) for (const x of [-3.3, -1.1, 1.1, 3.3]) if (!(x > 2 && z > 2)) out.push([x, z])
  return out
})()

export const PILE_SIZE = SLOTS.length

/** How much likelier a kind the kid does not own yet comes up in the pile. */
export const UNOWNED_WEIGHT = 3

/** `count` prize kinds, weighted so kinds the kid does not own yet come up often. */
export function pickKinds(rng: Rng, owned: readonly string[], count: number): string[] {
  const have = new Set(owned)
  const weights = PRIZES.map((p) => (have.has(p.id) ? 1 : UNOWNED_WEIGHT))
  const total = weights.reduce((s, w) => s + w, 0)
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    let r = rng() * total
    let k = 0
    while (k < PRIZES.length - 1 && r >= weights[k]) r -= weights[k++]
    out.push(PRIZES[k].id)
  }
  return out
}

/** A fresh pile: every slot filled, with a little jitter and a slight random turn. */
export function makePile(rng: Rng, owned: readonly string[]): PitPrize[] {
  const kinds = pickKinds(rng, owned, SLOTS.length)
  return SLOTS.map(([x, z], i) => ({
    id: i,
    kind: kinds[i],
    x: x + (rng() - 0.5) * 0.5,
    z: z + (rng() - 0.5) * 0.5,
    rot: (rng() - 0.5) * 1.2,
  }))
}

/** The prize nearest (x, z) within `radius`, or null. */
export function nearestPrize(pile: readonly PitPrize[], x: number, z: number, radius = GRAB_RADIUS): PitPrize | null {
  let best: PitPrize | null = null
  let bestD = radius
  for (const p of pile) {
    const d = Math.hypot(p.x - x, p.z - z)
    if (d <= bestD) {
      best = p
      bestD = d
    }
  }
  return best
}

/** One round's tries. */
export interface ClawRound {
  /** Tries used so far (0..MAX_TRIES). */
  used: number
  /** Kinds won this round, in order. */
  won: string[]
  /** The round's one slip has happened. */
  slipped: boolean
  /** The next try grabs for sure (it follows a slip). */
  guaranteed: boolean
}

export const newClawRound = (): ClawRound => ({ used: 0, won: [], slipped: false, guaranteed: false })

export const triesLeft = (round: ClawRound): number => Math.max(0, MAX_TRIES - round.used)
export const roundOver = (round: ClawRound): boolean => round.used >= MAX_TRIES

export type TryOutcome = { type: 'miss' } | { type: 'grab'; prize: PitPrize; slip: boolean }

/** What a drop at (x, z) does. Pure: `rng` decides the slip. */
export function resolveTry(round: ClawRound, pile: readonly PitPrize[], x: number, z: number, rng: Rng): TryOutcome {
  if (roundOver(round)) return { type: 'miss' }
  const prize = nearestPrize(pile, x, z, round.guaranteed ? Infinity : GRAB_RADIUS)
  if (!prize) return { type: 'miss' }
  const tryNo = round.used + 1
  const mayslip = !round.guaranteed && !round.slipped && tryNo >= SLIP_FROM_TRY && tryNo < MAX_TRIES
  return { type: 'grab', prize, slip: mayslip && rng() < SLIP_CHANCE }
}

/** The round after a try with `outcome`. */
export function applyTry(round: ClawRound, outcome: TryOutcome): ClawRound {
  if (roundOver(round)) return round
  const slip = outcome.type === 'grab' && outcome.slip
  return {
    used: round.used + 1,
    won: outcome.type === 'grab' && !slip ? [...round.won, outcome.prize.kind] : round.won,
    slipped: round.slipped || slip,
    guaranteed: slip,
  }
}

/** The pile without the prize `id` (won and gone down the chute). */
export const takeFromPile = (pile: readonly PitPrize[], id: number): PitPrize[] => pile.filter((p) => p.id !== id)
