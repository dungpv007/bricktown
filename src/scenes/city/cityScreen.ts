/**
 * Where a city cell's ground centre is on screen (client px), set once the City scene is mounted
 * (sized canvas, camera and gestures in place) and cleared when it goes. Read by the dev handle so
 * e2e specs wait for a live, still view before they tap, instead of measuring a canvas that is
 * still at its default size.
 */
export const cityScreen: { cellToClient: ((cx: number, cz: number) => { x: number; y: number }) | null } = {
  cellToClient: null,
}
