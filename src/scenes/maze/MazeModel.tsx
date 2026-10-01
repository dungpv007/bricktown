import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CELL } from '../../core/city'
import { COLORS, colorMaterialKind } from '../../core/colors'
import { DEFAULT_MAZE_FLOOR_COLOR, parseCellKey, type Cell, type Maze } from '../../core/maze'
import { useInstanceCapacity } from '../../render/instanceCapacity'
import { brickMaterials } from '../../render/materials'
import { checkerTexture4, coinGeometry, floorStudTexture, wallBlockGeometry, wallStudsGeometry } from './mazeGeometry'

const GRASS = '#7cc46a'
const FLOOR_THICKNESS = 0.4
const GRID_OPACITY = 0.14
/** How far the grass reaches past the maze (studs). */
const GRASS_BORDER = 160
const GOLD = COLORS[29].hex
const ENTRY_PAD = COLORS[11].hex // lime
const FLAG_RED = COLORS[2].hex
const POLE = COLORS[0].hex
const POLE_HEIGHT = 7
const MIN_CAPACITY = 32

const tmp = new THREE.Matrix4()
const tmpColor = new THREE.Color()

/** World centre of a cell on the floor. */
export const cellCenter = (cell: Cell): [number, number] => [(cell.cx + 0.5) * CELL, (cell.cz + 0.5) * CELL]

/** Studded baseplate under the maze (top at y = 0), faint cell lines, grass around it. */
function Floor({ w, h, color }: { w: number; h: number; color: number }) {
  const sx = w * CELL
  const sz = h * CELL
  const material = useMemo(() => {
    const map = floorStudTexture().clone() // own repeat per maze size; shares the canvas image
    map.repeat.set(sx, sz)
    map.needsUpdate = true
    return new THREE.MeshStandardMaterial({ map, roughness: 0.6 })
  }, [sx, sz])
  useEffect(
    () => () => {
      material.map?.dispose()
      material.dispose()
    },
    [material],
  )
  useLayoutEffect(() => {
    material.color.set(COLORS[color]?.hex ?? COLORS[DEFAULT_MAZE_FLOOR_COLOR].hex)
  }, [material, color])

  const grid = useMemo(() => {
    const points: number[] = []
    for (let i = 0; i <= w; i++) points.push(i * CELL, 0, 0, i * CELL, 0, sz)
    for (let j = 0; j <= h; j++) points.push(0, 0, j * CELL, sx, 0, j * CELL)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
    return g
  }, [w, h, sx, sz])
  useEffect(() => () => grid.dispose(), [grid])

  return (
    <group>
      <mesh position={[sx / 2, -FLOOR_THICKNESS / 2, sz / 2]} receiveShadow material={material}>
        <boxGeometry args={[sx, FLOOR_THICKNESS, sz]} />
      </mesh>
      <mesh position={[sx / 2, -FLOOR_THICKNESS, sz / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[sx + GRASS_BORDER * 2, sz + GRASS_BORDER * 2]} />
        <meshStandardMaterial color={GRASS} roughness={1} />
      </mesh>
      <lineSegments geometry={grid} position={[0, 0.02, 0]}>
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

/** Every wall cell as a brick-stack block with studs on top, in the wall colour. */
function Walls({ walls, color }: { walls: string[]; color: number }) {
  const kind = colorMaterialKind(color)
  const hex = COLORS[color]?.hex ?? '#ffffff'
  const material = brickMaterials[kind]
  return (
    <>
      <CellInstances cells={walls} geometry={wallBlockGeometry()} material={material} color={hex} castShadow={kind !== 'trans'} />
      <CellInstances cells={walls} geometry={wallStudsGeometry()} material={material} color={hex} castShadow={false} />
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
  const inset = CELL / 2 - 0.7
  const px = x + side[0] * inset
  const pz = z + side[1] * inset
  const checker = kind === 'exit' ? checkerTexture4() : null
  // The flag flies across the corridor, perpendicular to the pole's side offset.
  const flagRotY = side[0] !== 0 ? Math.PI / 2 : 0
  const flagOffset: [number, number] = [-side[0] * 1.6, -side[1] * 1.6]
  return (
    <group>
      <mesh position={[x, 0.06, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[CELL - 0.6, CELL - 0.6]} />
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
      <Walls walls={maze.walls} color={maze.wallColor} />
      <CellInstances cells={maze.coins} geometry={coinGeometry()} material={brickMaterials.metal} color={GOLD} castShadow y={0.05} />
      {maze.entry && <Door maze={maze} cell={maze.entry} kind="entry" />}
      {maze.exit && <Door maze={maze} cell={maze.exit} kind="exit" />}
    </group>
  )
}
