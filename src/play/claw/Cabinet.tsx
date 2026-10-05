import { useMemo } from 'react'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Brick } from '../../core/types'
import { BrickModel, brick } from '../kit'
import { PrizeModel } from './PrizeModel'
import { PRIZES } from './prizes'

/**
 * The 🏆 prize cabinet ("Tủ quà"): a brick-built display case with three glass shelves of four, one
 * place per prize kind. Won kinds stand there in colour; the others are dark silhouettes. It stands far
 * off to the side of the arcade room; the game turns its camera to it.
 */

const COLS = 4
const ROWS = 3
const CELL_W = 3
const SIZE = 1.9
const BROWN = 9
const TAN = 10
const GOLD = 29

/** World: where the cabinet stands, and the camera looking at it. */
export const CABINET_AT: [number, number, number] = [200, 0, 0]
export const CABINET_CAMERA = {
  position: [CABINET_AT[0], 7, 26] as [number, number, number],
  target: [CABINET_AT[0], 5.4, 0] as [number, number, number],
  fov: 40,
  fitWidth: 18,
}

/** The case's width (studs), its shelves' heights and its top (plates). */
const W = COLS * CELL_W + 2
const SHELF_Y = [0, 8, 16]
const TOP_Y = 24
const DEPTH = 3

function caseBricks(): Brick[] {
  const out: Brick[] = []
  // Sides: brown pillars; back: tan bricks; three brown shelves; a brown top with a gold crown.
  for (let y = 0; y < TOP_Y; y += 3) {
    for (const x of [0, W - 1]) {
      out.push(brick('brick_1x2', BROWN, x, y, 0))
      out.push(brick('brick_1x1', BROWN, x, y, 2))
    }
    for (let x = 1; x < W - 1; x += 6) out.push(brick('brick_1x6', TAN, x, y, 0, 1))
  }
  for (const y of SHELF_Y) for (let x = 1; x < W - 1; x += 4) out.push(brick('plate_2x4', BROWN, x, y, 1, 1))
  for (let x = 0; x < W; x += 2) {
    out.push(brick('plate_2x2', BROWN, x, TOP_Y, 0))
    out.push(brick('plate_1x2', BROWN, x, TOP_Y, 2, 1))
  }
  for (let x = 1; x < W - 1; x += 2) out.push(brick('round_1x1', GOLD, x, TOP_Y + 1, 1))
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
