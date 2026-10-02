import type { AuthoringIssue } from '../../core/authoring'
import { MAX_BRICKS } from '../../core/model'
import type { Lang } from '../../state/useApp'
import { t, type TKey } from '../i18n'

/** Longest English detail shown for a problem without a kid-friendly sentence of its own. */
const MAX_DETAIL = 140

const fill = (text: string, values: Record<string, string | number | undefined>) =>
  text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? '?'))

const KEYS: Partial<Record<AuthoringIssue['code'], TKey>> = {
  unsupported: 'authErrFloating',
  collision: 'authErrOverlap',
  out_of_bounds: 'authErrOutside',
  too_high: 'authErrTooHigh',
  part_unknown: 'authErrPart',
  color_unknown: 'authErrColor',
  limit: 'authErrLimit',
  json: 'authErrJson',
}

/**
 * One problem of a plain authoring JSON import, short enough for the error card ("Brick #12
 * (brick_2x4) is floating at y=6"); problems without a sentence of their own show the checker's
 * English message, cut short.
 */
export function issueText(issue: AuthoringIssue, lang: Lang): string {
  const key = KEYS[issue.code]
  const brickIssue = issue.brick !== undefined || issue.code === 'limit' || issue.code === 'json'
  const text = key && brickIssue
    ? fill(t(key, lang), { n: issue.brick, p: issue.part, y: issue.at?.y, m: issue.other, max: MAX_BRICKS })
    : issue.message.length > MAX_DETAIL ? `${issue.message.slice(0, MAX_DETAIL - 1)}…` : issue.message
  return issue.blueprint ? `${issue.blueprint}: ${text}` : text
}
