import type { Template } from '../../core/types'
import { bench } from './bench'
import { car } from './car'
import { houseSmall } from './house_small'
import { lamp } from './lamp'
import { tree } from './tree'

export const TEMPLATES: Template[] = [tree, lamp, bench, car, houseSmall]

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id)
}
