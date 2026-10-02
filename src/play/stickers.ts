import type { LocalizedText } from '../core/types'
import type { GameId, GameStats, PlayData } from './types'

/**
 * The 🏅 sticker book: 24 collectible stickers, each earned by a milestone over the kid's play data.
 * Ids are stable (they are saved); only ever append. Pure: the menu reads it without 3D code.
 */
export interface Sticker {
  id: string
  icon: string
  name: LocalizedText
  /** The game it belongs to (shown on that game's page of the book); absent = any game. */
  game?: GameId
  /** True once the kid has reached the milestone. */
  earned: (play: PlayData) => boolean
}

/** The four role-play games of the plan (the dev-only `demo` never earns game stickers). */
export const REAL_GAMES: readonly GameId[] = ['sushi', 'bakery', 'grocery', 'rescue']

const ZERO: GameStats = { rounds: 0, customers: 0, perfect: 0, coins: 0 }

/** One game's counters (zeros when it was never played). */
export const statsOf = (play: PlayData, game: GameId): GameStats => play.stats?.[game] ?? ZERO

/** Counters added up over the real games. */
export function totals(play: PlayData): GameStats {
  const out = { ...ZERO }
  for (const g of REAL_GAMES) {
    const s = statsOf(play, g)
    out.rounds += s.rounds
    out.customers += s.customers
    out.perfect += s.perfect
    out.coins += s.coins
  }
  return out
}

/** Three stickers per game: the first round, five rounds, a round with no "try again". */
function gameStickers(game: GameId, icons: [string, string, string], names: [LocalizedText, LocalizedText, LocalizedText]): Sticker[] {
  return [
    { id: `${game}_first`, icon: icons[0], name: names[0], game, earned: (p) => statsOf(p, game).rounds >= 1 },
    { id: `${game}_5`, icon: icons[1], name: names[1], game, earned: (p) => statsOf(p, game).rounds >= 5 },
    { id: `${game}_perfect`, icon: icons[2], name: names[2], game, earned: (p) => statsOf(p, game).perfect >= 1 },
  ]
}

export const STICKERS: Sticker[] = [
  { id: 'first_customer', icon: '👋', name: { vi: 'Khách đầu tiên', en: 'First customer' }, earned: (p) => totals(p).customers >= 1 },
  { id: 'customers_10', icon: '🙂', name: { vi: '10 vị khách', en: '10 customers' }, earned: (p) => totals(p).customers >= 10 },
  { id: 'customers_50', icon: '😄', name: { vi: '50 vị khách', en: '50 customers' }, earned: (p) => totals(p).customers >= 50 },
  { id: 'customers_100', icon: '🤩', name: { vi: '100 vị khách', en: '100 customers' }, earned: (p) => totals(p).customers >= 100 },
  { id: 'rounds_5', icon: '🎈', name: { vi: 'Chơi 5 lượt', en: '5 rounds' }, earned: (p) => totals(p).rounds >= 5 },
  { id: 'rounds_20', icon: '🎉', name: { vi: 'Chơi 20 lượt', en: '20 rounds' }, earned: (p) => totals(p).rounds >= 20 },
  { id: 'coins_100', icon: '🪙', name: { vi: '100 xu', en: '100 coins' }, earned: (p) => totals(p).coins >= 100 },
  { id: 'coins_500', icon: '💰', name: { vi: '500 xu', en: '500 coins' }, earned: (p) => totals(p).coins >= 500 },
  { id: 'perfect_first', icon: '⭐', name: { vi: 'Ngôi sao', en: 'Star round' }, earned: (p) => totals(p).perfect >= 1 },
  { id: 'all_games', icon: '🌈', name: { vi: 'Thử hết các vai', en: 'Tried every role' }, earned: (p) => REAL_GAMES.every((g) => statsOf(p, g).rounds >= 1) },
  { id: 'shopper', icon: '🛍️', name: { vi: 'Mua sắm', en: 'Shopper' }, earned: (p) => p.unlocked.length >= 1 },
  { id: 'collector', icon: '🎁', name: { vi: 'Nhà sưu tầm', en: 'Collector' }, earned: (p) => p.unlocked.length >= 3 },
  ...gameStickers('sushi', ['🍣', '👨‍🍳', '🐟'], [
    { vi: 'Sushi đầu tiên', en: 'First sushi' },
    { vi: 'Đầu bếp sushi', en: 'Sushi chef' },
    { vi: 'Sushi hoàn hảo', en: 'Perfect sushi' },
  ]),
  ...gameStickers('bakery', ['🧁', '🎂', '🍓'], [
    { vi: 'Bánh đầu tiên', en: 'First cake' },
    { vi: 'Vua làm bánh', en: 'Cake master' },
    { vi: 'Bánh hoàn hảo', en: 'Perfect cake' },
  ]),
  ...gameStickers('grocery', ['🛒', '🧾', '🍎'], [
    { vi: 'Thu ngân mới', en: 'New cashier' },
    { vi: 'Thu ngân giỏi', en: 'Super cashier' },
    { vi: 'Đếm tiền đúng', en: 'Perfect change' },
  ]),
  ...gameStickers('rescue', ['🚒', '🚓', '🦸'], [
    { vi: 'Cuộc gọi đầu tiên', en: 'First call' },
    { vi: 'Anh hùng thành phố', en: 'City hero' },
    { vi: 'Cứu hộ hoàn hảo', en: 'Perfect rescue' },
  ]),
]

export const STICKER_BY_ID: Record<string, Sticker> = Object.fromEntries(STICKERS.map((s) => [s.id, s]))

/** Stickers the kid has reached but does not have yet, in book order. */
export const newStickers = (play: PlayData): string[] =>
  STICKERS.filter((s) => !play.stickers.includes(s.id) && s.earned(play)).map((s) => s.id)
