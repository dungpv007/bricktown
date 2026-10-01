import { describe, expect, it } from 'vitest'
import { FIG_ACCESSORIES, FIG_FACES, FIG_HATS, FIG_PRINTS } from '../../core/figures'
import { en } from './en'
import { vi } from './vi'

// The figure editor builds these keys from the option lists (`${prefix}${option}`), so the type
// checker cannot catch a missing one.
describe('figure option labels', () => {
  const lists: Array<[string, readonly string[]]> = [
    ['figHat_', FIG_HATS], ['figFace_', FIG_FACES], ['figPrint_', FIG_PRINTS], ['figAcc_', FIG_ACCESSORIES],
  ]
  it.each(lists)('every %s option has a Vietnamese and an English label', (prefix, options) => {
    for (const o of options) {
      const key = `${prefix}${o}`
      expect((vi as Record<string, string>)[key], `vi.${key}`).toBeTruthy()
      expect((en as Record<string, string>)[key], `en.${key}`).toBeTruthy()
    }
  })
})
