import type { MazeTemplate } from '../../core/maze'
import { mazeFromAscii } from './ascii'

/** A double spiral: the corridor winds in from the entry to the middle, then winds back out between its own turns to the exit. */
export const spiral: MazeTemplate = {
  id: 'spiral',
  name: { vi: 'Xoắn ốc', en: 'Spiral' },
  difficulty: 2,
  maze: mazeFromAscii(
    [
      '###########',
      'E....o....#',
      '#########.#',
      'X.......#o#',
      '#######.#.#',
      '#...###.#.#',
      '#.#.###o#.#',
      '#o#.....#.#',
      '#.#######.#',
      '#....o....#',
      '###########',
    ],
    { id: 'spiral', name: 'Spiral', wallColor: 6 },
  ),
}
