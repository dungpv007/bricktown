import type { MazeTemplate } from '../../core/maze'
import { mazeFromAscii } from './ascii'

export const hard: MazeTemplate = {
  id: 'hard',
  name: { vi: 'Mê cung khó', en: 'Hard maze' },
  difficulty: 3,
  maze: mazeFromAscii(
    [
      '###############',
      '#...#..o#.....#',
      '#.#.#.###o###.#',
      '#.....#.....#.#',
      '#.###.#.#.#.#.#',
      'E..o#.#.#.#...#',
      '#.#o#.#.#.#.#.#',
      '#o#.#o#.....#.#',
      '###.###.#####.#',
      '#...#...#o....X',
      '#.#.#.#####.###',
      '#.#o#.....#...#',
      '#.###.###.###.#',
      '#.............#',
      '###############',
    ],
    { id: 'hard', name: 'Hard maze', wallColor: 13 },
  ),
}
