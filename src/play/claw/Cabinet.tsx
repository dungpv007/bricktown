import { useMemo } from 'react'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Brick } from '../../core/types'
import { BrickModel, brick } from '../kit'
import { PrizeModel } from './PrizeModel'
import { PRIZES } from './prizes'

/**
 * The 🏆 prize cabinet ("Tủ quà"): a brick-built display case with two glass shelves of five, one
 * place per prize kind. Won kinds stand there in colour; the others are dark silhouettes. It stands far
 * off to the side of the arcade room; the game turns its camera to it.
 */

const COLS = 5
const ROWS = 2
const CELL_W = 3
const SIZE = 1.9
const BROWN = 9
const TAN = 10
const GOLD = 29

/** World: where the cabinet stands, and the camera looking at it. */
export const CABINET_AT: [number, number, number] = [200, 0, 0]
export const CABINET_CAMERA = {
  position: [CABINET_AT[0], 6, 26] as [number, number, number],
  target: [CABINET_AT[0], 3.5, 0] as [number, number, number],
  fov: 40,
  fitWidth: 19,
}

/** The case's width (studs), its shelves' heights and its top (plates). */
const W = COLS * CELL_W + 2
const SHELF_Y = [0, 8]
const TOP_Y = 16
const DEPTH = 3

/** 1-wide lengths the catalog has, longest first (a run of bricks or plates is cut into these). */
const RUNS = [6, 4, 3, 2, 1]

/** Splits `n` studs into catalog lengths from `lengths` (longest first). */
function cut(n: number, lengths: readonly number[]): number[] {
  const out: number[] = []
  let left = n
  while (left > 0) {
    const len = lengths.find((l) => l <= left)!
    out.push(len)
    left -= len
  }
  return out
}

function caseBricks(): Brick[] {
  const out: Brick[] = []
  // Sides: brown pillars; back: tan bricks; brown shelves; a brown top with a gold crown.
  for (let y = 0; y < TOP_Y; y += 3) {
    for (const x of [0, W - 1]) {
      out.push(brick('brick_1x2', BROWN, x, y, 0))
      out.push(brick('brick_1x1', BROWN, x, y, 2))
    }
    let x = 1
    for (const len of cut(W - 2, RUNS)) {
      out.push(len === 1 ? brick('brick_1x1', TAN, x, y, 0) : brick(`brick_1x${len}`, TAN, x, y, 0, 1))
      x += len
    }
  }
  for (const y of SHELF_Y) {
    let x = 1
    for (const len of cut(W - 2, [4, 2, 1])) {
      out.push(len === 4 ? brick('plate_2x4', BROWN, x, y, 1, 1) : len === 2 ? brick('plate_2x2', BROWN, x, y, 1) : brick('plate_1x2', BROWN, x, y, 1))
      x += len
    }
  }
  let x = 0
  for (const len of cut(W, [4, 2, 1])) {
    out.push(len === 4 ? brick('plate_4x4', BROWN, x, TOP_Y, 0) : len === 2 ? brick('plate_2x2', BROWN, x, TOP_Y, 0) : brick('plate_1x2', BROWN, x, TOP_Y, 0))
    x += len
  }
  for (let gx = 1; gx < W - 1; gx += 2) out.push(brick('round_1x1', GOLD, gx, TOP_Y + 1, 1))
  return out
}

/** Where kind `i` stands (cabinet-local world units): rows from the top shelf down. */
function slot(i: number): [number, number, number] {
  const col = i % COLS
  const row = Math.floor(i / COLS)
  return [-(COLS * CELL_W) / 2 + CELL_W * (col + 0.5), (SHELF_Y[ROWS - 1 - row] + 1) * 0.4, 0.4]
}

export interface CabinetProps {
  gltf: GLTF
  owned: readonly string[]
}

export default function Cabinet({ gltf, owned }: CabinetProps) {
  const bricks = useMemo(() => caseBricks(), [])
  const have = new Set(owned)
  return (
    <group position={CABINET_AT}>
      {/* A soft back wall behind the case. */}
      <mesh position={[0, 30, -2]}>
        <boxGeometry args={[160, 62, 0.5]} />
        <meshStandardMaterial color="#2c2457" />
      </mesh>
      <mesh position={[0, -0.05, 40]}>
        <boxGeometry args={[160, 0.1, 84]} />
        <meshStandardMaterial color="#4a3a7a" />
      </mesh>
      <BrickModel bricks={bricks} centered={false} position={[-W / 2, 0, -DEPTH / 2]} />
      {PRIZES.map((p, i) => (
        <PrizeModel key={p.id} kind={p.id} gltf={gltf} silhouette={!have.has(p.id)} position={slot(i)} scale={SIZE} />
      ))}
      {/* The glass front. */}
      <mesh position={[0, (TOP_Y * 0.4) / 2, DEPTH / 2 + 0.05]}>
        <boxGeometry args={[W - 0.2, TOP_Y * 0.4, 0.05]} />
        <meshStandardMaterial color="#d8f0ff" transparent opacity={0.14} roughness={0.05} depthWrite={false} />
      </mesh>
    </group>
  )
}
