import { forwardRef, useMemo } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import type * as THREE from 'three'
import { bakeBricks, bakedGeometries } from '../../core/bake'
import { figKey, figPreset, MINIFIG_PART } from '../../core/figures'
import type { Brick, FigStyle, Rot } from '../../core/types'
import BakedMeshes from '../../render/BakedMeshes'

/**
 * Food, props and figures for the games, built from catalog bricks and baked through the shared
 * cache (one geometry per material kind, shared by equal models; freed when the game closes).
 */

let seq = 0

/** A brick for a game model: part `p`, colour `c` (COLORS index), at stud x / plate y / stud z, turned `r`. */
export function brick(p: string, c: number, x = 0, y = 0, z = 0, r: Rot = 0): Brick {
  seq += 1
  return { id: `kit${seq}`, p, c, x, y, z, r }
}

/** A minifigure brick wearing `fig` (a style, or a `FIG_PRESETS` id). */
export function figureBrick(fig: FigStyle | string, x = 0, y = 0, z = 0, r: Rot = 0): Brick {
  const style = typeof fig === 'string' ? figPreset(fig) : fig
  return { id: `fig:${figKey(style)}`, p: MINIFIG_PART, c: style.torso, x, y, z, r, fig: style }
}

type GroupProps = Omit<ThreeElements['group'], 'ref'>

export interface BrickModelProps extends GroupProps {
  bricks: Brick[]
  /**
   * Put the model's footprint centre on the group origin, its bottom at y = 0 (default true), so a
   * model is placed by where it stands instead of by its corner brick.
   */
  centered?: boolean
}

/** Draws `bricks` (keep the array stable, e.g. `useMemo`: a new array is a new bake lookup). */
export const BrickModel = forwardRef<THREE.Group, BrickModelProps>(function BrickModel({ bricks, centered = true, children, ...group }, ref) {
  const baked = useMemo(() => bakeBricks(bricks), [bricks])
  const offset = useMemo<[number, number, number]>(() => {
    if (!centered) return [0, 0, 0]
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
    for (const [, g] of bakedGeometries(baked)) {
      if (!g.boundingBox) g.computeBoundingBox()
      const b = g.boundingBox
      if (!b || b.isEmpty()) continue
      minX = Math.min(minX, b.min.x)
      minY = Math.min(minY, b.min.y)
      minZ = Math.min(minZ, b.min.z)
      maxX = Math.max(maxX, b.max.x)
      maxZ = Math.max(maxZ, b.max.z)
    }
    return minX === Infinity ? [0, 0, 0] : [-(minX + maxX) / 2, -minY, -(minZ + maxZ) / 2]
  }, [baked, centered])
  return (
    <group ref={ref} {...group}>
      <BakedMeshes baked={baked} position={offset} />
      {children}
    </group>
  )
})

export interface MinifigProps extends GroupProps {
  /** A style or a `FIG_PRESETS` id. */
  fig: FigStyle | string
}

/** One minifigure standing on the group origin, facing +Z (toward the stage camera). */
export const Minifig = forwardRef<THREE.Group, MinifigProps>(function Minifig({ fig, ...group }, ref) {
  const key = typeof fig === 'string' ? fig : figKey(fig)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the key identifies the look
  const bricks = useMemo(() => [figureBrick(fig)], [key])
  return <BrickModel ref={ref} bricks={bricks} {...group} />
})

/** Height of a standing minifigure (studs): where a speech bubble goes. */
export const MINIFIG_HEIGHT = 4.8
