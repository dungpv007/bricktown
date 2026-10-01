import { useEffect } from 'react'
import { evictBakes } from '../core/bake'
import { useGame } from '../state/useGame'
import { liveBakeKeys } from './sources'

/**
 * For scenes that draw from the shared bake cache: when the scene unmounts (its GL context goes with
 * it), frees the cached bakes that no template or saved blueprint shows any more (older blueprint
 * versions, deleted blueprints). A scene mounting at the same time only draws live bakes from the
 * cache, so nothing it uses is freed.
 */
export function useEvictStaleBakesOnUnmount(): void {
  useEffect(
    () => () => {
      evictBakes(liveBakeKeys(useGame.getState().data))
    },
    [],
  )
}
