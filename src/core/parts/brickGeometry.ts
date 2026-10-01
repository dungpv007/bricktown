import type * as THREE from 'three'
import { figKey, figOf, isFigure } from '../figures'
import type { Brick } from '../types'
import { getFigureGeometry } from './figureGeometry'
import { getPartGeometry } from './geometry'
import { getPrintGeometry } from './printGeometry'

/**
 * What a brick looks like, for every render path (instanced, baked, ghosts): most bricks look like
 * their part; a minifigure looks like its own style. All results are shared caches: never dispose.
 */

/** Bricks with equal shape keys share their geometries: the part id, or the part plus the figure's look. */
export function brickShapeKey(b: Brick): string {
  return isFigure(b) ? `${b.p}:${figKey(figOf(b))}` : b.p
}

/** The body geometry (part space). A figure's carries its own vertex colours. */
export function brickBodyGeometry(b: Brick): THREE.BufferGeometry {
  return isFigure(b) ? getFigureGeometry(figOf(b)).body : getPartGeometry(b.p)
}

/** The print overlay (part space), or null when the brick has none. */
export function brickPrintGeometry(b: Brick): THREE.BufferGeometry | null {
  return isFigure(b) ? getFigureGeometry(figOf(b)).print : getPrintGeometry(b.p)
}

/** True when the body is vertex-coloured (the brick colour does not tint it). */
export const hasOwnColors = (b: Brick): boolean => isFigure(b)
