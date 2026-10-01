import { useEffect, useState } from 'react'
import { useT, type TKey } from './i18n'

const ERROR_ICON_MS = 900

/**
 * Brief red icon (no text) each time `errorSeq` changes, i.e. whenever an action is rejected.
 * `testId` tells the editors apart for e2e specs; `labelKey` names the rejection for screen readers.
 */
export default function ErrorBadge({
  errorSeq,
  testId,
  labelKey = 'cantPlace',
}: {
  errorSeq: number
  testId: string
  labelKey?: TKey
}) {
  const t = useT()
  const [hiddenSeq, setHiddenSeq] = useState(errorSeq)
  useEffect(() => {
    if (errorSeq === hiddenSeq) return
    const id = setTimeout(() => setHiddenSeq(errorSeq), ERROR_ICON_MS)
    return () => clearTimeout(id)
  }, [errorSeq, hiddenSeq])
  if (errorSeq === hiddenSeq) return null
  return (
    <div key={errorSeq} className="bt-error-badge" role="status" aria-label={t(labelKey)} data-testid={testId}>
      🚫
    </div>
  )
}
