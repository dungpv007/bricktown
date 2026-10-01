/**
 * Where a maze cell's floor centre is on screen (client px), set while the maze editor is shown.
 * Read by the dev handle so e2e specs can tap and drag on real cells.
 */
export const mazeScreen: { cellToClient: ((cx: number, cz: number) => { x: number; y: number }) | null } = {
  cellToClient: null,
}
