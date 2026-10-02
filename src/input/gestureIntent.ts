/** What a gesture on the workshop view started on. */
export type GestureStart = 'brick' | 'plate' | 'sky'

export interface GestureFacts {
  start: GestureStart
  /** Most pointers down at once during the gesture so far. */
  pointers: number
  /** Primary button / touch / pen contact (right and middle mouse buttons are camera only). */
  primary: boolean
  /** The pointer has moved at least `TAP_MAX_PX` from where it went down. */
  moved: boolean
  /** The gesture is over and was a tap (see `isTap`). */
  tap: boolean
  /** The gesture is over (released), tap or not. */
  ended: boolean
}

/**
 * - `tap-select` / `tap-place` / `tap-deselect`: a tap on a brick, the empty plate, the sky.
 * - `drag-brick`: one finger moving from a brick moves that brick.
 * - `hold-brick`: a press on a brick that has not moved (yet): nothing happens, the camera stays.
 *   Released without having moved, however long it was held, it selects the brick (`tap-select`).
 * - `orbit`: one finger (or the mouse) anywhere else moves the camera (the controls decide how); `pinch`: two fingers.
 */
export type GestureIntent = 'tap-select' | 'tap-place' | 'tap-deselect' | 'drag-brick' | 'hold-brick' | 'orbit' | 'pinch'

/** Classifies a workshop gesture, while it runs (`tap`, `ended` false) or once it ended. */
export function gestureIntent(f: GestureFacts): GestureIntent {
  if (f.pointers > 1) return 'pinch'
  if (!f.primary) return 'orbit'
  if (f.tap) return f.start === 'brick' ? 'tap-select' : f.start === 'plate' ? 'tap-place' : 'tap-deselect'
  if (f.start !== 'brick') return 'orbit'
  if (f.moved) return 'drag-brick'
  return f.ended ? 'tap-select' : 'hold-brick'
}
