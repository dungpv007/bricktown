/**
 * Live numbers about the City's ambient life, written by the NPC renderer every frame and read by
 * the dev handle (`window.__bt.npcCount()`, e2e checks, performance probes). Plain object: no store,
 * nothing re-renders when it changes.
 */
export const npcStats = {
  /** NPCs drawn right now (0 when the City or its life is off). */
  count: 0,
  /** Smoothed milliseconds per frame spent stepping the simulation and writing matrices. */
  frameMs: 0,
  /** Draw calls and triangles of the whole City frame before this one (renderer info). */
  calls: 0,
  triangles: 0,
}
