import { whoosh } from '../audio/sfx'

/** Which kinds of drag are in progress right now (a brick moved on the view, a part out of the palette). */
const active = new Set<'brick' | 'palette'>()

/** Marks a drag of `kind` as started (`on`, with a "whoosh") or finished. */
export function setDragActive(kind: 'brick' | 'palette', on: boolean): void {
  if (on && !active.has(kind)) whoosh()
  if (on) active.add(kind)
  else active.delete(kind)
}

/** True while any drag is in progress (e.g. keyboard shortcuts wait until it is over). */
export function isDragActive(): boolean {
  return active.size > 0
}
