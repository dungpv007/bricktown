import { gestureIntent, type GestureFacts, type GestureIntent, type GestureStart } from './gestureIntent'

/** What a gesture on the city view started on: a placement, the ground inside the city, or outside it. */
export type CityGestureStart = 'placement' | 'ground' | 'outside'

export interface CityGestureFacts extends Omit<GestureFacts, 'start'> {
  start: CityGestureStart
  /** Road mode is on: one finger paints (or erases) roads instead of selecting and moving. */
  roadMode: boolean
}

/**
 * - `tap-select`: a tap (or a still press, however long) on a placement selects it.
 * - `tap-ground`: a tap on the empty ground quick-places the picked source there, or deselects.
 * - `tap-deselect`: a tap outside the city.
 * - `drag-placement`: one finger moving from a placement moves it; `hold-placement`: a press on a
 *   placement that has not moved (yet): the camera stays still under it.
 * - `pan`: one finger (or the mouse) anywhere else moves the camera; `pinch`: two fingers.
 * - `road`: road mode, one finger / the left button: paints or erases roads, taps included.
 */
export type CityGestureIntent =
  | 'tap-select'
  | 'tap-ground'
  | 'tap-deselect'
  | 'drag-placement'
  | 'hold-placement'
  | 'pan'
  | 'pinch'
  | 'road'

const START: Record<CityGestureStart, GestureStart> = { placement: 'brick', ground: 'plate', outside: 'sky' }
const INTENT: Record<GestureIntent, CityGestureIntent> = {
  'tap-select': 'tap-select',
  'tap-place': 'tap-ground',
  'tap-deselect': 'tap-deselect',
  'drag-brick': 'drag-placement',
  'hold-brick': 'hold-placement',
  orbit: 'pan',
  pinch: 'pinch',
}

/** Classifies a city gesture the way the Workshop does (`gestureIntent`), plus road mode. */
export function cityGestureIntent(f: CityGestureFacts): CityGestureIntent {
  if (f.pointers > 1) return 'pinch'
  if (f.roadMode && f.primary) return 'road'
  const { pointers, primary, moved, tap, ended } = f
  return INTENT[gestureIntent({ start: START[f.start], pointers, primary, moved, tap, ended })]
}
