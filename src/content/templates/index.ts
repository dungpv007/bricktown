import type { Template } from '../../core/types'
import { apartment } from './apartment'
import { arcade } from './arcade'
import { bakery } from './bakery'
import { bench } from './bench'
import { bus } from './bus'
import { bushFlowers } from './bush_flowers'
import { car } from './car'
import { fireStation } from './fire_station'
import { fireTruck } from './fire_truck'
import { flowerBed } from './flower_bed'
import { fountain } from './fountain'
import { garage } from './garage'
import { grocery } from './grocery'
import { houseBlue } from './house_blue'
import { houseSmall } from './house_small'
import { houseTall } from './house_tall'
import { lamp } from './lamp'
import { officeTower } from './office_tower'
import { pineTree } from './pine_tree'
import { playground } from './playground'
import { policeCar } from './police_car'
import { policeHq } from './police_hq'
import { policeStation } from './police_station'
import { restaurant } from './restaurant'
import { robot } from './robot'
import { rocket } from './rocket'
import { roundTree } from './round_tree'
import { skyscraper } from './skyscraper'
import { sushiRestaurant } from './sushi_restaurant'
import { taxi } from './taxi'
import { toyShop } from './toy_shop'
import { trainCarriage } from './train_carriage'
import { trainEngine } from './train_engine'
import { tree } from './tree'
import { truck } from './truck'

const ALL: Template[] = [
  apartment, arcade, bakery, bench, bus, bushFlowers, car, fireStation, fireTruck, flowerBed, fountain,
  garage, grocery, houseBlue, houseSmall, houseTall, lamp, officeTower, pineTree, playground,
  policeCar, policeHq, policeStation, restaurant, robot, rocket, roundTree, skyscraper,
  sushiRestaurant, taxi, toyShop, trainCarriage, trainEngine, tree, truck,
]

/** Sorted by difficulty, then name, so the picker shows the easiest builds first. */
export const TEMPLATES: Template[] = [...ALL].sort(
  (a, b) => a.difficulty - b.difficulty || a.name.en.localeCompare(b.name.en),
)

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id)
}
