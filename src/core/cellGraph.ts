import { DIRS, roadKey } from './roads'

/**
 * Graphs over auto-tiled city cell layers (roads, rails): two cells are linked when they are
 * 4-neighbours in the same layer, exactly the links the tiles draw. Pure and cheap: the NPC
 * simulation builds its road and rail networks from these.
 */

export interface CellXZ {
  cx: number
  cz: number
}

/** The cell of a "cx,cz" key (NaN parts for a malformed key). */
export function parseKey(key: string): CellXZ {
  const i = key.indexOf(',')
  return { cx: Number(key.slice(0, i)), cz: Number(key.slice(i + 1)) }
}

/** Adjacency of a cell layer: every key of `cells` to its 4-neighbours that are in `cells` too (N, E, S, W order). */
export type CellGraph = Map<string, string[]>

export function cellGraph(cells: Iterable<string>): CellGraph {
  const set = new Set(cells)
  const graph: CellGraph = new Map()
  for (const key of set) {
    const { cx, cz } = parseKey(key)
    const links: string[] = []
    for (const d of DIRS) {
      const k = roadKey(cx + d.dx, cz + d.dz)
      if (set.has(k)) links.push(k)
    }
    graph.set(key, links)
  }
  return graph
}

/** The connected parts of a graph, each a list of keys in breadth-first order; biggest first. */
export function components(graph: CellGraph): string[][] {
  const seen = new Set<string>()
  const out: string[][] = []
  for (const start of graph.keys()) {
    if (seen.has(start)) continue
    seen.add(start)
    const part = [start]
    for (let i = 0; i < part.length; i++) {
      for (const next of graph.get(part[i]) ?? []) {
        if (seen.has(next)) continue
        seen.add(next)
        part.push(next)
      }
    }
    out.push(part)
  }
  return out.sort((a, b) => b.length - a.length)
}

/** Whether a component is one simple closed loop: at least 4 cells, each linked to exactly two others. */
export function isLoop(graph: CellGraph, component: string[]): boolean {
  return component.length >= 4 && component.every((k) => graph.get(k)?.length === 2)
}

/**
 * The cells of a simple loop or line in path order: a loop starts anywhere and goes round once, a
 * line runs from one end to the other. Null when the component branches (some cell has 3+ links).
 */
export function pathOrder(graph: CellGraph, component: string[]): string[] | null {
  if (component.length === 0) return []
  if (component.some((k) => (graph.get(k)?.length ?? 0) > 2)) return null
  const start = component.find((k) => (graph.get(k)?.length ?? 0) < 2) ?? component[0]
  const order = [start]
  const seen = new Set(order)
  let at = start
  for (;;) {
    const next = (graph.get(at) ?? []).find((k) => !seen.has(k))
    if (next === undefined) break
    order.push(next)
    seen.add(next)
    at = next
  }
  return order.length === component.length ? order : null
}
