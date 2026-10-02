import { shadowMapSize } from '../state/graphics'
import { useGraphics } from '../state/useGraphics'

/**
 * A scene's sun shadow from the graphics settings: whether the light casts one, and its map size
 * (`base`: the scene's usual size, doubled for "high"). A size change while the scene runs is applied
 * by the canvas (see BtCanvas / applyShadowSettings).
 */
export function useSunShadow(base: number): { castShadow: boolean; mapSize: number } {
  const config = useGraphics()
  return { castShadow: config.shadows, mapSize: shadowMapSize(config, base) }
}
