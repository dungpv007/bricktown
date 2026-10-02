import { useMemo } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { MAZE_CELL, type Maze } from '../../core/maze'
import { mergeWallRects } from '../../core/mazeRun'

/**
 * Taller than the drawn walls (and the low hedges, which block like walls): the car can neither
 * climb nor be thrown over them.
 */
const WALL_COLLIDER_HEIGHT = 5
const GROUND_BORDER = 40
const GROUND_HALF_HEIGHT = 1
const BOUND_THICKNESS = 2
/** Low friction on walls so a car scrapes along them instead of climbing. */
const WALL_FRICTION = 0.2

/**
 * Static physics for a maze: the floor (top at y = 0), every wall cell merged into few boxes,
 * and invisible bounds around the grid so the car cannot leave through the open doors.
 */
export default function MazeColliders({ maze }: { maze: Pick<Maze, 'w' | 'h' | 'walls'> }) {
  const rects = useMemo(() => mergeWallRects(maze), [maze])
  const sx = maze.w * MAZE_CELL
  const sz = maze.h * MAZE_CELL
  const hy = WALL_COLLIDER_HEIGHT / 2
  const t = BOUND_THICKNESS / 2
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider
        args={[sx / 2 + GROUND_BORDER, GROUND_HALF_HEIGHT, sz / 2 + GROUND_BORDER]}
        position={[sx / 2, -GROUND_HALF_HEIGHT, sz / 2]}
        friction={1}
      />
      <CuboidCollider args={[t, hy, sz / 2 + BOUND_THICKNESS]} position={[-t, hy, sz / 2]} friction={WALL_FRICTION} />
      <CuboidCollider args={[t, hy, sz / 2 + BOUND_THICKNESS]} position={[sx + t, hy, sz / 2]} friction={WALL_FRICTION} />
      <CuboidCollider args={[sx / 2 + BOUND_THICKNESS, hy, t]} position={[sx / 2, hy, -t]} friction={WALL_FRICTION} />
      <CuboidCollider args={[sx / 2 + BOUND_THICKNESS, hy, t]} position={[sx / 2, hy, sz + t]} friction={WALL_FRICTION} />
      {rects.map((r) => (
        <CuboidCollider
          key={`${r.cx},${r.cz}`}
          args={[(r.w * MAZE_CELL) / 2, hy, (r.d * MAZE_CELL) / 2]}
          position={[(r.cx + r.w / 2) * MAZE_CELL, hy, (r.cz + r.d / 2) * MAZE_CELL]}
          friction={WALL_FRICTION}
        />
      ))}
    </RigidBody>
  )
}
