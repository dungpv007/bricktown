import { useCallback } from 'react'
import { useApp, type Lang } from '../../state/useApp'
import { en } from './en'
import { vi } from './vi'

export type TKey = keyof typeof vi

const dictionaries: Record<Lang, Record<TKey, string>> = { vi, en }

/** Translate `key`; defaults to the current app language. */
export function t(key: TKey, lang: Lang = useApp.getState().lang): string {
  return dictionaries[lang][key]
}

/** Returns a `t` bound to the current language; re-renders the component when it changes. */
export function useT(): (key: TKey) => string {
  const lang = useApp((s) => s.lang)
  return useCallback((key: TKey) => t(key, lang), [lang])
}
