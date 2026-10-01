import type { MazeTemplate } from '../../core/maze'
import { mazeFromAscii } from './ascii'

/** The floor is heart-shaped (two lobes, a point at the bottom); everything outside is wall. The exit is the heart's tip. */
export const heart: MazeTemplate = {
  id: 'heart',
  name: { vi: 'Trái tim', en: 'Heart' },
  difficulty: 2,
  maze: mazeFromAscii(
    [
      '###############',
      '###..o###...###',
      '###.#####.#.###',
      'E.............#',
      '#.###.#.#.#.#.#',
      '#.........#...#',
      '###.#.#.#.#.###',
      '###o#o#.....###',
      '#######.#.#####',
      '#####o....#####',
      '#######.#######',
      '#######.#######',
      '#######.#######',
      '#######.#######',
      '#######X#######',
    ],
    { id: 'heart', name: 'Heart', wallColor: 12 },
  ),
}
