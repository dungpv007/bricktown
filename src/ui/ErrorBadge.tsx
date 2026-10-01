import { useEffect, useState } from 'react'
import { useT } from './i18n'

const ERROR_ICON_MS = 900

/**
 * Brief red icon (no text) each time `errorSeq` changes, i.e. whenever an action is rejected.
 * `testId` tells the editors apart for e2e specs.
 */
export default function ErrorBadge({ errorSeq, testId }: { errorSeq: number; testId: string }) {
  const t = useT()
  const [hiddenSeq, setHiddenSeq] = useState(errorSeq)
  useEffect(() => {
    if (errorSeq === hiddenSeq) return
    const id = setTimeout(() => setHiddenSeq(errorSeq), ERROR_ICON_MS)
    return () => clearTimeout(id)
  }, [errorSeq, hiddenSeq])
  if (errorSeq === hiddenSeq) return null
  return (
    <div key={errorSeq} className="bt-error-badge" role="status" aria-label={t('cantPlace')} data-testid={testId}>
      🚫
    </div>
  )
}
