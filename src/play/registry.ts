import type { ComponentType } from 'react'
import type { LocalizedText } from '../core/types'
import { lazyScene } from '../ui/lazyScene'
import type { GameId } from './types'

/**
 * Every role-play game: its look in the picker, the City templates that offer it (a ▶️ badge over
 * their placements) and its lazy scene. Light on purpose (no three.js): the main menu and the City
 * read it. A game's code lives in `src/play/<game>/` and is its own chunk.
 *
 * HOW A GAME REGISTERS: set its entry's `scene` (one line), e.g.
 *   scene: lazyScene(() => import('./sushi/SushiGame')),
 * The module's default export is a `GameScene`. Until then (`scene: null`) the game still shows in
 * the picker and on City badges, and opens a friendly "Sắp ra mắt" (coming soon) card.
 */

/** What the app hands a game scene. */
export interface GameSceneProps {
  gameId: GameId
  /** Leaves the game: back to the City spot (or the menu) it was started from. */
  onExit: () => void
}

export type GameScene = ComponentType<GameSceneProps>

export interface GameDef {
  id: GameId
  icon: string
  name: LocalizedText
  /** Card colour in the picker (a theme colour). */
  color: string
  /** Template ids whose City placements offer this game (a ▶️ badge, a 🎮 action). */
  templates: readonly string[]
  /** The lazy scene; null until the game lands (it then opens the coming-soon card). */
  scene: GameScene | null
  /** Left out of the picker (the dev-only demo in production). */
  hidden?: boolean
}

export const GAMES: readonly GameDef[] = [
  {
    id: 'sushi',
    icon: '🍣',
    name: { vi: 'Nhà hàng sushi', en: 'Sushi restaurant' },
    color: 'var(--bt-red)',
    templates: ['sushi_restaurant'],
    scene: lazyScene(() => import('./sushi/SushiGame')),
  },

  {
    id: 'bakery',
    icon: '🎂',
    name: { vi: 'Tiệm bánh', en: 'Bakery' },
    color: 'var(--bt-orange)',
    templates: ['bakery'],
    scene: lazyScene(() => import('./bakery/BakeryGame')),
  },

  {
    id: 'grocery',
    icon: '🛒',
    name: { vi: 'Thu ngân tạp hóa', en: 'Grocery cashier' },
    color: 'var(--bt-green)',
    templates: ['grocery'],
    scene: lazyScene(() => import('./grocery/GroceryGame')),
  },

  {
    id: 'rescue',
    icon: '🚒',
    name: { vi: 'Cứu hỏa và cảnh sát', en: 'Fire and police' },
    color: 'var(--bt-blue)',
    templates: ['fire_station', 'police_station', 'police_hq'],
    scene: lazyScene(() => import('./rescue/RescueGame')),
  },

  {
    id: 'claw',
    icon: '🕹️',
    name: { vi: 'Gắp thú', en: 'Claw machine' },
    color: 'var(--bt-purple)',
    templates: ['arcade'],
    scene: lazyScene(() => import('./claw/ClawGame')),
  },

  {
    // Proves the framework end to end (tests, manual checks); never shown to kids in production.
    id: 'demo',
    icon: '🧪',
    name: { vi: 'Thử nghiệm', en: 'Demo' },
    color: 'var(--bt-purple)',
    templates: [],
    scene: import.meta.env.DEV ? lazyScene(() => import('./demo/DemoGame')) : null,
    hidden: !import.meta.env.DEV,
  },
]

const BY_ID = new Map(GAMES.map((g) => [g.id, g]))

export const gameById = (id: GameId): GameDef | undefined => BY_ID.get(id)

/** The games in the picker, in order. */
export const pickerGames = (): GameDef[] => GAMES.filter((g) => !g.hidden)

const BY_TEMPLATE = new Map<string, GameDef>()
for (const g of GAMES) for (const t of g.templates) if (!BY_TEMPLATE.has(t)) BY_TEMPLATE.set(t, g)

/** The game a City placement's model offers (`tpl:<id>` sources only), if any. */
export function gameForSource(source: string): GameDef | undefined {
  return source.startsWith('tpl:') ? BY_TEMPLATE.get(source.slice(4)) : undefined
}
