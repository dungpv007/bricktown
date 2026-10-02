import { useApp, type Lang } from '../../state/useApp'

/**
 * The sushi game's few words (screen-reader labels only: kids play by pictures), in vi and en.
 * Kept with the game, under a `sushi` prefix, so the shared dictionaries stay untouched.
 */
const STRINGS = {
  sushiCoins: { vi: 'Xu lượt này', en: 'Coins this round' },
  sushiOrder: { vi: 'Khách gọi món', en: 'The order' },
} satisfies Record<string, Record<Lang, string>>

export type SushiKey = keyof typeof STRINGS

export function useSushiT(): (key: SushiKey) => string {
  const lang = useApp((s) => s.lang)
  return (key) => STRINGS[key][lang]
}
