import { useMemo } from 'react'
import { placementCells } from '../../core/city'
import { useGame } from '../../state/useGame'
import type { MissionPlan } from './plan'
import { sourceInfoOf } from './plan'
import { useRescueT } from './text'

/**
 * The call's picture map: the town from above (roads, water, buildings), the station's truck, the
 * target pulsing with its 🔥 / 🦹, and the way along the roads as yellow dots. No words.
 */
export default function MiniMap({ plan }: { plan: MissionPlan }) {
  const t = useRescueT()
  const blueprints = useGame((s) => s.data.blueprints)
  const { city, target, spawn, path } = plan
  const shapes = useMemo(() => {
    const infoOf = sourceInfoOf({ blueprints })
    const rects = city.placements.flatMap((p) => {
      const info = infoOf(p.source)
      if (!info || info.kind === 'vehicle') return []
      const { cw, cd } = placementCells(p, info.size)
      return [{ id: p.id, x: p.cx, z: p.cz, w: cw, d: cd, kind: info.kind, target: p.id === target.placementId }]
    })
    // Frame what is there (roads and models), with a cell of margin.
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
    const grow = (x0: number, z0: number, x1: number, z1: number) => {
      minX = Math.min(minX, x0)
      minZ = Math.min(minZ, z0)
      maxX = Math.max(maxX, x1)
      maxZ = Math.max(maxZ, z1)
    }
    const roads = city.roads.map((k) => k.split(',').map(Number) as [number, number])
    for (const [x, z] of roads) grow(x, z, x + 1, z + 1)
    for (const r of rects) grow(r.x, r.z, r.x + r.w, r.z + r.d)
    if (minX === Infinity) grow(0, 0, city.size, city.size)
    const box = { x: minX - 1, z: minZ - 1, w: maxX - minX + 2, d: maxZ - minZ + 2 }
    const water = (city.terrain?.water ?? []).map((k) => k.split(',').map(Number) as [number, number])
    const dots = path.map((k) => k.split(',').map(Number) as [number, number])
    return { rects, roads, water, dots, box }
  }, [city, blueprints, target.placementId, path])

  const { box } = shapes
  const unit = 8 // world studs per cell
  const icon = Math.max(2.4, Math.min(box.w, box.d) * 0.11)
  return (
    <svg className="bt-rescue-map" data-testid="rescue-map" viewBox={`${box.x} ${box.z} ${box.w} ${box.d}`} role="img" aria-label={t('rescueMap')}>
      <rect x={box.x} y={box.z} width={box.w} height={box.d} fill="#8fcf72" rx={1} />
      {shapes.water.map(([x, z]) => (
        <rect key={`w${x},${z}`} x={x} y={z} width={1.02} height={1.02} fill="#5bb6e8" />
      ))}
      {shapes.roads.map(([x, z]) => (
        <rect key={`r${x},${z}`} x={x} y={z} width={1.02} height={1.02} fill="#6c6e68" />
      ))}
      {shapes.rects.map((r) => (
        <rect
          key={r.id}
          x={r.x + 0.1}
          y={r.z + 0.1}
          width={r.w - 0.2}
          height={r.d - 0.2}
          rx={0.3}
          fill={r.target ? (plan.kind === 'fire' ? '#ff6a3d' : '#b45cff') : r.kind === 'building' ? '#f4e6c8' : '#5aa64a'}
          stroke={r.target ? '#fff' : 'rgba(0,0,0,0.25)'}
          strokeWidth={r.target ? 0.35 : 0.12}
        />
      ))}
      {shapes.dots.map(([x, z], i) => (
        <circle key={`d${i}`} cx={x + 0.5} cy={z + 0.5} r={0.28} fill="#ffe14d" stroke="#1b2a34" strokeWidth={0.06} />
      ))}
      <g className="bt-rescue-map-target">
        <circle cx={target.x / unit} cy={target.z / unit} r={icon * 0.75} fill="rgba(255,225,77,0.55)" />
      </g>
      <text x={target.x / unit} y={target.z / unit} fontSize={icon} textAnchor="middle" dominantBaseline="central">
        {plan.kind === 'fire' ? '🔥' : '🦹'}
      </text>
      <text x={spawn.x / unit} y={spawn.z / unit} fontSize={icon * 0.9} textAnchor="middle" dominantBaseline="central">
        {plan.kind === 'fire' ? '🚒' : '🚓'}
      </text>
    </svg>
  )
}
