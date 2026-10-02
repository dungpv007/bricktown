import { useCallback } from 'react'
import type { LocalizedText } from '../../core/types'
import { useApp } from '../../state/useApp'

/**
 * The rescue game's words (vi / en), in its own `rescue*` namespace so it lands without touching the
 * shared dictionaries. Kids need none of them: they are labels for screen readers and grown-ups.
 */
export const RESCUE_TEXT = {
  rescueAnswer: { vi: 'Nghe điện thoại', en: 'Answer the phone' },
  rescueGoFire: { vi: 'Lái xe cứu hỏa đi cứu', en: 'Drive the fire truck there' },
  rescueGoPolice: { vi: 'Lái xe cảnh sát đi bắt trộm', en: 'Drive the police car there' },
  rescueFireCall: { vi: 'Có cháy! Nhà này đang cháy', en: 'Fire! This building is burning' },
  rescuePoliceCall: { vi: 'Có trộm! Ở cửa hàng này', en: 'A robber! At this shop' },
  rescueMap: { vi: 'Bản đồ đường đi', en: 'Map of the way' },
  rescueSpray: { vi: 'Giữ để phun nước', en: 'Hold to spray water' },
  rescueCatch: { vi: 'Chạm vào tên trộm để bắt', en: 'Tap the robber to catch him' },
  rescueHurray: { vi: 'Hoan hô!', en: 'Hooray!' },
} satisfies Record<string, LocalizedText>

export type RescueKey = keyof typeof RESCUE_TEXT

/** `t` for the rescue words, in the app's language. */
export function useRescueT(): (key: RescueKey) => string {
  const lang = useApp((s) => s.lang)
  return useCallback((key: RescueKey) => RESCUE_TEXT[key][lang], [lang])
}
