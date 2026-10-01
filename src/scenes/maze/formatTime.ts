import type { TKey } from '../../ui/i18n'

/** A run time as "12.3s" (the unit from the dictionary), for the clock, the finish card and best runs. */
export function formatSeconds(ms: number, t: (key: TKey) => string): string {
  return t('mazeSeconds').replace('{n}', (ms / 1000).toFixed(1))
}
