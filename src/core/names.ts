/**
 * Names kids type or receive (models, mazes, cities, shared creations) made safe to show as text.
 * Its own module so the save format (core/serialize) and the share import can both use it.
 */

/** At most this many characters, and at most `units` UTF-16 code units (a character can carry many combining marks). */
export const NAME_LIMITS = { length: 40, units: 200 } as const

/**
 * Characters that can hide or disguise text: controls, soft hyphen, zero-width and direction marks,
 * line/paragraph separators, invisible operators, BOM, tag characters, blank fillers (Hangul, the
 * combining grapheme joiner, the Mongolian vowel separator, Khmer inherent vowels) and lone
 * surrogates (with the `u` flag a surrogate range only matches unpaired halves). The zero-width
 * joiner and variation selectors are kept: emoji sequences need them.
 */
// Combining marks are alternatives of their own: inside a class they read as joined to the character before.
const UNSAFE_CHARS =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u115F\u1160\u180E\u200B-\u200C\u200E-\u200F\u2028-\u202E\u2060-\u2064\u2066-\u2069\u3164\uFEFF\uFFA0\u{E0000}-\u{E007F}\uD800-\uDFFF]|\u034F|\u17B4|\u17B5/gu
/** Kept inside a name but invisible on their own: joiners, variation and Mongolian selectors, braille blank. */
const INVISIBLE_KEPT =
  /\u200D|\u2800|\u180B|\u180C|\u180D|\u180F|[\uFE00-\uFE0F]|[\u{E0100}-\u{E01EF}]/gu
/** Something a kid can see: a letter, digit, symbol (emoji) or punctuation mark. */
const VISIBLE = /[\p{L}\p{N}\p{S}\p{P}]/u
/** Longest input looked at: far more than 40 characters, even with many combining marks. */
const NAME_SCAN = 4096

const graphemes: Intl.Segmenter | null =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

/**
 * The first `n` user-perceived characters (code points where Intl.Segmenter is missing), stopping
 * before a character that would take the text past `maxUnits` UTF-16 code units.
 */
function firstChars(s: string, n: number, maxUnits: number): string {
  const segments = graphemes ? Array.from(graphemes.segment(s), (g) => g.segment) : Array.from(s)
  let out = ''
  for (const segment of segments.slice(0, n)) {
    if (out.length + segment.length > maxUnits) break
    out += segment
  }
  return out
}

/**
 * A name to show as text: without hiding characters, trimmed, at most 40 characters and 200 code
 * units (never cutting an emoji apart); `fallback` when nothing visible is left.
 */
export function sanitizeName(v: unknown, fallback = ''): string {
  if (typeof v !== 'string') return fallback
  // The scan slice can split a surrogate pair: the half left over is removed with the unsafe characters.
  const clean = firstChars(
    v.slice(0, NAME_SCAN).replace(UNSAFE_CHARS, '').trim(),
    NAME_LIMITS.length,
    NAME_LIMITS.units,
  )
  return VISIBLE.test(clean.replace(INVISIBLE_KEPT, '')) ? clean : fallback
}
