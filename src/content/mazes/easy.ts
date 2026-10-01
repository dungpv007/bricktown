import type { MazeTemplate } from '../../core/maze'
import { mazeFromAscii } from './ascii'

export const easy: MazeTemplate = {
  id: 'easy',
  name: { vi: 'Mê cung dễ', en: 'Easy maze' },
  difficulty: 1,
  maze: mazeFromAscii(
    [
      '#######',
      '#....o#',
      '#.#.###',
      '#o#...#',
      '#.###.#',
      'E..o#.X',
      '#######',
    ],
    { id: 'easy', name: 'Easy maze', wallColor: 5 },
  ),
}
