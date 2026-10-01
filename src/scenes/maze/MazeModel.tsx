import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { COLORS, colorMaterialKind } from '../../core/colors'
import { DEFAULT_MAZE_FLOOR_COLOR, MAZE_CELL, parseCellKey, type Cell, type Maze } from '../../core/maze'
import { voidWalls } from '../../core/mazeRun'
import { useInstanceCapacity } from '../../render/instanceCapacity'
import { brickMaterials } from '../../render/materials'
import { checkerTexture4, coinGeometry, floorStudTexture, hedgeGeometry, wallBlockGeometry, wallStudsGeometry } from './mazeGeometry'
import { HEDGE_HEIGHT, WALL_HEIGHT } from './mazeView'

const GRASS = '#7cc46a'
const FLOOR_THICKNESS = 0.4
const GRID_OPACITY = 0.14
/** How far the grass reaches past the maze (studs). */
const GRASS_BORDER = 160
const GOLD = COLORS[29].hex
const HEDGE = COLORS[5].hex // green
const ENTRY_PAD = COLORS[11].hex // lime
const FLAG_RED = COLORS[2].hex
const POLE = COLORS[0].hex
const POLE_HEIGHT = 7
const MIN_CAPACITY = 32

const tmp = new THREE.Matrix4()
const tmpColor = new THREE.Color()

/** World centre of a cell on the floor. */
export const cellCenter = (cell: Cell): [number, number] => [(cell.cx + 0.5) * MAZE_CELL, (cell.cz + 0.5) * MAZE_CELL]

/** Studded baseplate under the maze (top at y = 0), faint cell lines, grass around it. */
function Floor({ w, h, color }: { w: number; h: number; color: number }) {
  const sx = w * MAZE_CELL
  const sz = h * MAZE_CELL
  // Declared in JSX (R3F creates and disposes them); the stud texture is a shared cached one.
  const grid = useMemo(() => {
    const points: number[] = []
    for (let i = 0; i <= w; i++) points.push(i * MAZE_CELL, 0, 0, i * MAZE_CELL, 0, sz)
    for (let j = 0; j <= h; j++) points.push(0, 0, j * MAZE_CELL, sx, 0, j * MAZE_CELL)
    return new Float32Array(points)
  }, [w, h, sx, sz])

  return (
    <group>
      <mesh position={[sx / 2, -FLOOR_THICKNESS / 2, sz / 2]} receiveShadow>
        <boxGeometry args={[sx, FLOOR_THICKNESS, sz]} />
        <meshStandardMaterial
          map={floorStudTexture(sx, sz)}
          color={COLORS[color]?.hex ?? COLORS[DEFAULT_MAZE_FLOOR_COLOR].hex}
          roughness={0.6}
        />
      </mesh>
      <mesh position={[sx / 2, -FLOOR_THICKNESS, sz / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[sx + GRASS_BORDER * 2, sz + GRASS_BORDER * 2]} />
        <meshStandardMaterial color={GRASS} roughness={1} />
      </mesh>
      <lineSegments position={[0, 0.02, 0]}>
        {/* Keyed: a new size is a new geometry (a buffer attribute cannot grow). */}
        <bufferGeometry key={`${w}x${h}`}>
          <bufferAttribute attach="attributes-position" args={[grid, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#000000" transparent opacity={GRID_OPACITY} depthWrite={false} />
      </lineSegments>
    </group>
  )
}

interface CellInstancesProps {
  cells: string[]
  geometry: THREE.BufferGeometry
  material: THREE.Material
  color: string
  castShadow: boolean
  /** Height of the geometry's origin above the floor. */
  y?: number
}

/** One instance of `geometry` centred on each cell ("cx,cz" keys), all in one colour. */
function CellInstances({ cells, geometry, material, color, castShadow, y = 0 }: CellInstancesProps) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const capacity = useInstanceCapacity(cells.length, MIN_CAPACITY)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    tmpColor.set(color)
    cells.forEach((key, i) => {
      const [x, z] = cellCenter(parseCellKey(key))
      mesh.setMatrixAt(i, tmp.makeTranslation(x, y, z))
      mesh.setColorAt(i, tmpColor)
    })
    mesh.count = cells.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [cells, color, capacity, y, material])
  // Shared geometry/material go in through `args`: R3F's unmount dispose only frees the instance buffers.
  return (
    <instancedMesh
      key={`${capacity}-${material.uuid}`}
      ref={ref}
      args={[geometry, material, capacity]}
      castShadow={castShadow}
      receiveShadow
    />
  )
}

/**
 * Wall cells as brick-stack blocks with studs on top, in the wall colour. Walls with no floor
 * around them (the filler outside a maze's shape) are low green hedges instead, so the shape reads.
 */
function Walls({ maze }: { maze: Pick<Maze, 'w' | 'h' | 'walls' | 'wallColor'> }) {
  const { w, h, walls, wallColor: color } = maze
  const [solid, hedges] = useMemo(() => {
    const low = voidWalls({ w, h, walls })
    return [walls.filter((k) => !low.has(k)), walls.filter((k) => low.has(k))]
  }, [w, h, walls])
  const kind = colorMaterialKind(color)
  const hex = COLORS[color]?.hex ?? '#ffffff'
  const material = brickMaterials[kind]
  return (
    <>
      <CellInstances cells={solid} geometry={wallBlockGeometry()} material={material} color={hex} castShadow={kind !== 'trans'} />
      <CellInstances cells={solid} geometry={wallStudsGeometry()} material={material} color={hex} castShadow={false} />
      <CellInstances cells={hedges} geometry={hedgeGeometry()} material={brickMaterials.opaque} color={HEDGE} castShadow={false} />
      <CellInstances
        cells={hedges}
        geometry={wallStudsGeometry()}
        material={brickMaterials.opaque}
        color={HEDGE}
        castShadow={false}
        y={HEDGE_HEIGHT - WALL_HEIGHT}
      />
    </>
  )
}

/** The side of a border door's cell (unit x, z) its flag pole stands against: along the doorway, not in it. */
function poleSide(maze: Pick<Maze, 'w' | 'h'>, cell: Cell): [number, number] {
  return cell.cx === 0 || cell.cx === maze.w - 1 ? [0, -1] : [-1, 0]
}

/**
 * Entry 🚩 (lime pad, red flag) or exit 🏁 (chequered pad and flag). The pole stands against the
 * corridor's side so a car can drive through the doorway.
 */
function Door({ maze, cell, kind }: { maze: Pick<Maze, 'w' | 'h'>; cell: Cell; kind: 'entry' | 'exit' }) {
  const [x, z] = cellCenter(cell)
  const side = poleSide(maze, cell)
  const inset = MAZE_CELL / 2 - 0.7
  const px = x + side[0] * inset
  const pz = z + side[1] * inset
  const checker = kind === 'exit' ? checkerTexture4() : null
  // The flag flies across the corridor, perpendicular to the pole's side offset.
  const flagRotY = side[0] !== 0 ? Math.PI / 2 : 0
  const flagOffset: [number, number] = [-side[0] * 1.6, -side[1] * 1.6]
  return (
    <group>
      <mesh position={[x, 0.06, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[MAZE_CELL - 0.6, MAZE_CELL - 0.6]} />
        {checker ? (
          <meshStandardMaterial map={checker} roughness={0.7} polygonOffset polygonOffsetFactor={-1} />
        ) : (
          <meshStandardMaterial color={ENTRY_PAD} roughness={0.7} polygonOffset polygonOffsetFactor={-1} />
        )}
      </mesh>
      <mesh position={[px, POLE_HEIGHT / 2, pz]} castShadow>
        <cylinderGeometry args={[0.22, 0.22, POLE_HEIGHT, 10]} />
        <meshStandardMaterial color={POLE} roughness={0.4} />
      </mesh>
      <mesh position={[px + flagOffset[0], POLE_HEIGHT - 1.1, pz + flagOffset[1]]} rotation={[0, flagRotY, 0]} castShadow>
        <boxGeometry args={[0.12, 2, 3.2]} />
        {checker ? (
          <meshStandardMaterial map={checker} roughness={0.6} />
        ) : (
          <meshStandardMaterial color={FLAG_RED} roughness={0.6} />
        )}
      </mesh>
    </group>
  )
}

/** The whole maze: floor, walls, entry and exit, coins. */
export default function MazeModel({ maze }: { maze: Maze }) {
  return (
    <group>
      <Floor w={maze.w} h={maze.h} color={maze.floorColor ?? DEFAULT_MAZE_FLOOR_COLOR} />
      <Walls maze={maze} />
      <CellInstances cells={maze.coins} geometry={coinGeometry()} material={brickMaterials.metal} color={GOLD} castShadow y={0.05} />
      {maze.entry && <Door maze={maze} cell={maze.entry} kind="entry" />}
      {maze.exit && <Door maze={maze} cell={maze.exit} kind="exit" />}
    </group>
  )
}
