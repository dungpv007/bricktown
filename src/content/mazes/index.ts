import type { MazeTemplate } from '../../core/maze'
import { easy } from './easy'
import { medium } from './medium'
import { hard } from './hard'
import { spiral } from './spiral'
import { heart } from './heart'

export const MAZE_TEMPLATES: MazeTemplate[] = [easy, medium, hard, spiral, heart]

export function getMazeTemplate(id: string): MazeTemplate | undefined {
  return MAZE_TEMPLATES.find((t) => t.id === id)
}
