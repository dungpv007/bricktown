import { figKey, figPreset } from '../figures'
import type { FigStyle } from '../types'

/**
 * What the NPCs look like: ready-made templates for vehicles (only those this version has are
 * used, so templates added later simply join in) and a few figure presets for pedestrians (few looks
 * keep the draw calls low).
 */

/**
 * Car models, in order of preference; missing templates are skipped. Only car-wide ones (4 studs):
 * traffic is shrunk to fit a lane, and the 6-wide bus and truck would come out no bigger than a car.
 */
export const CAR_TEMPLATE_IDS: readonly string[] = ['car', 'taxi', 'police_car', 'fire_truck']
/** Train engine and carriage models, first existing one wins (a truck stands in when there is no train). */
export const TRAIN_ENGINE_IDS: readonly string[] = ['train_engine', 'truck', 'car']
export const TRAIN_CARRIAGE_IDS: readonly string[] = ['train_carriage', 'train_engine', 'truck', 'car']

export const PEDESTRIAN_PRESETS: readonly string[] = ['customer', 'customer2', 'kid', 'doctor']

export const pedestrianStyles = (): FigStyle[] => PEDESTRIAN_PRESETS.map(figPreset)

/** The pedestrians' figure looks (`figKey`s): the shared figure cache keeps them while the City may draw them. */
export const pedestrianFigKeys = (): string[] => pedestrianStyles().map(figKey)
