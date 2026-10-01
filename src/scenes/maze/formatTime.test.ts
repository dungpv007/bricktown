import { describe, expect, it } from 'vitest'
import { t } from '../../ui/i18n'
import { formatSeconds } from './formatTime'

describe('formatSeconds', () => {
  it('shows tenths of a second with the unit of the language', () => {
    expect(formatSeconds(12345, (k) => t(k, 'en'))).toBe('12.3s')
    expect(formatSeconds(0, (k) => t(k, 'vi'))).toBe('0.0s')
  })
})
