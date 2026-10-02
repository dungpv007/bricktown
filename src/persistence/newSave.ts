import { sampleCity } from '../content/cities/sample'
import { createEmptySave } from '../core/serialize'
import type { SaveData } from '../core/types'
import { readFlag } from '../ui/flags'

/**
 * Test-only switch: with `localStorage['bricktown-e2e-empty-city'] = '1'`, fresh saves start with an
 * empty city instead of the sample town. The Playwright configs set it for every spec (most of them
 * build on an empty map); the specs about the sample town clear it. Players never set it.
 */
export const E2E_EMPTY_CITY_KEY = 'bricktown-e2e-empty-city'

/**
 * What a slot with nothing saved in it starts as (a fresh install, a slot never used, a deleted
 * slot): an empty save whose first (and only) city is a fresh copy of the sample town. Existing saves never go
 * through here, so they keep their own city.
 */
export function createNewSave(): SaveData {
  const save = createEmptySave()
  if (!readFlag(E2E_EMPTY_CITY_KEY)) save.cities[0].city = sampleCity()
  return save
}
