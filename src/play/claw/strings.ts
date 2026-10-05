import { useApp, type Lang } from '../../state/useApp'

/**
 * The claw game's few words (labels for screen readers and the two notices), in vi and en. Kept with
 * the game under a `claw` prefix, so the shared dictionaries stay untouched.
 */
const STRINGS = {
  clawLoading: { vi: 'Đang chuẩn bị máy gắp…', en: 'Getting the claw machine ready…' },
  clawOffline: { vi: 'Cần mạng lần đầu', en: 'Needs the internet the first time' },
  clawRetry: { vi: 'Thử lại', en: 'Try again' },
  clawTries: { vi: 'Lượt gắp còn lại', en: 'Tries left' },
  clawLeft: { vi: 'Sang trái', en: 'Left' },
  clawRight: { vi: 'Sang phải', en: 'Right' },
  clawBack: { vi: 'Vào trong', en: 'Back' },
  clawFront: { vi: 'Ra ngoài', en: 'Forward' },
  clawDrop: { vi: 'Gắp!', en: 'Grab!' },
  clawCabinet: { vi: 'Tủ quà', en: 'Prize cabinet' },
  clawPrize: { vi: 'Lấy quà', en: 'Take the prize' },
  clawWon: { vi: 'Quà ván này', en: 'Prizes this round' },
  clawDuplicate: { vi: 'Có rồi: đổi thành xu', en: 'Got it already: turned into coins' },
} satisfies Record<string, Record<Lang, string>>

export type ClawKey = keyof typeof STRINGS

export function useClawT(): (key: ClawKey) => string {
  const lang = useApp((s) => s.lang)
  return (key) => STRINGS[key][lang]
}
