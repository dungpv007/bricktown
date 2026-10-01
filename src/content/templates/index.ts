import type { Template } from '../../core/types'
import { bench } from './bench'
import { bushFlowers } from './bush_flowers'
import { car } from './car'
import { fireStation } from './fire_station'
import { fireTruck } from './fire_truck'
import { garage } from './garage'
import { houseBlue } from './house_blue'
import { houseSmall } from './house_small'
import { houseTall } from './house_tall'
import { lamp } from './lamp'
import { policeCar } from './police_car'
import { policeHq } from './police_hq'
import { policeStation } from './police_station'
import { restaurant } from './restaurant'
import { robot } from './robot'
import { rocket } from './rocket'
import { skyscraper } from './skyscraper'
import { tree } from './tree'
import { truck } from './truck'

const ALL: Template[] = [
  bench, bushFlowers, car, fireStation, fireTruck, garage, houseBlue, houseSmall, houseTall,
  lamp, policeCar, policeHq, policeStation, restaurant, robot, rocket, skyscraper, tree, truck,
]

/** Sorted by difficulty, then name, so the picker shows the easiest builds first. */
export const TEMPLATES: Template[] = [...ALL].sort(
  (a, b) => a.difficulty - b.difficulty || a.name.en.localeCompare(b.name.en),
)

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id)
}
