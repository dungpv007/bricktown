import { GIFT_ANIMALS, GIFT_LOOKS, NON_VEHICLES, PRIZES, VEHICLES, VEHICLE_SHARE, type GiftLook } from './prizes'

/**
 * The claw machine's rules, pure (unit-tested; the scene only animates what they decide):
 * - the claw moves over the prize pit inside fixed bounds;
 * - a drop grabs the prize nearest the claw when its top is within a generous radius (easy!);
 * - a grab slips one time in five (the prize falls back into the pit mid-lift), on any try; mercy:
 *   after two slips in a row, the next grab holds for sure (misses in between do not break the run);
 * - about a third of the pile are gift boxes, each hiding an animal or a vehicle, opened at the prize
 *   door;
 * - vehicles are 60% of the draws (pit items and gift contents alike); within each group, kinds the
 *   kid does not own yet come up more often;
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
/** The chance a grab slips. */
export const SLIP_CHANCE = 0.2
/** After this many slips in a row, the next grab cannot slip. */
export const MERCY_AFTER = 2
/** About this share of the pile are gift boxes. */
export const GIFT_SHARE = 0.3

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
  /** A gift box with this look: `kind` is what is inside (a surprise until it is opened). */
  gift?: GiftLook
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

const ALL_KINDS: readonly string[] = PRIZES.map((p) => p.id)

/** `count` kinds out of `from` (all prize kinds by default), weighted so kinds not owned yet come up often. */
export function pickKinds(rng: Rng, owned: readonly string[], count: number, from: readonly string[] = ALL_KINDS): string[] {
  const have = new Set(owned)
  const weights = from.map((id) => (have.has(id) ? 1 : UNOWNED_WEIGHT))
  const total = weights.reduce((s, w) => s + w, 0)
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    let r = rng() * total
    let k = 0
    while (k < from.length - 1 && r >= weights[k]) r -= weights[k++]
    out.push(from[k])
  }
  return out
}

/** A fresh pile: every slot filled (about a third with gift boxes), a little jitter, a slight turn. */
export function makePile(rng: Rng, owned: readonly string[]): PitPrize[] {
  return SLOTS.map(([x, z], i) => {
    const gift = rng() < GIFT_SHARE ? GIFT_LOOKS[Math.floor(rng() * GIFT_LOOKS.length)] : undefined
    // First the group (vehicles 60%), then a kind within it.
    const group = rng() < VEHICLE_SHARE ? VEHICLES : gift ? GIFT_ANIMALS : NON_VEHICLES
    const [kind] = pickKinds(rng, owned, 1, group)
    const p: PitPrize = { id: i, kind, x: x + (rng() - 0.5) * 0.5, z: z + (rng() - 0.5) * 0.5, rot: (rng() - 0.5) * 1.2 }
    if (gift) p.gift = gift
    return p
  })
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
  /** Slips in a row (a grab that holds ends the run; a miss does not). */
  streak: number
}

export const newClawRound = (): ClawRound => ({ used: 0, won: [], streak: 0 })

/** The next grab cannot slip (mercy after `MERCY_AFTER` slips in a row). */
export const isGuaranteed = (round: ClawRound): boolean => round.streak >= MERCY_AFTER

export const triesLeft = (round: ClawRound): number => Math.max(0, MAX_TRIES - round.used)
export const roundOver = (round: ClawRound): boolean => round.used >= MAX_TRIES

export type TryOutcome = { type: 'miss' } | { type: 'grab'; prize: PitPrize; slip: boolean }

/** What a drop at (x, z) does. Pure: `rng` decides the slip. */
export function resolveTry(round: ClawRound, pile: readonly PitPrize[], x: number, z: number, rng: Rng): TryOutcome {
  if (roundOver(round)) return { type: 'miss' }
  const prize = nearestPrize(pile, x, z)
  if (!prize) return { type: 'miss' }
  return { type: 'grab', prize, slip: !isGuaranteed(round) && rng() < SLIP_CHANCE }
}

/** The round after a try with `outcome`. */
export function applyTry(round: ClawRound, outcome: TryOutcome): ClawRound {
  if (roundOver(round)) return round
  const slip = outcome.type === 'grab' && outcome.slip
  return {
    used: round.used + 1,
    won: outcome.type === 'grab' && !slip ? [...round.won, outcome.prize.kind] : round.won,
    streak: slip ? round.streak + 1 : outcome.type === 'grab' ? 0 : round.streak,
  }
}

/** The pile without the prize `id` (won and gone down the chute). */
export const takeFromPile = (pile: readonly PitPrize[], id: number): PitPrize[] => pile.filter((p) => p.id !== id)
