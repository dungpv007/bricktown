import type { MazeTemplate } from '../../core/maze'
import { mazeFromAscii } from './ascii'

export const medium: MazeTemplate = {
  id: 'medium',
  name: { vi: 'Mê cung vừa', en: 'Medium maze' },
  difficulty: 2,
  maze: mazeFromAscii(
    [
      '###########',
      '#o......#o#',
      '#######.#.#',
      '#o......#.#',
      '#.#o#.#.#.#',
      '#.#...#...#',
      '#.#.#.###.#',
      '#.#....o#.#',
      '#.#.#####.#',
      'E.#.......X',
      '###########',
    ],
    { id: 'medium', name: 'Medium maze', wallColor: 14 },
  ),
}
