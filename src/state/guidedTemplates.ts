import { getTemplate } from '../content/templates'
import type { Template } from '../core/types'
import { useGame } from './useGame'

/**
 * What Guided mode can build: the built-in templates and the models friends shared "with
 * instructions" (`data.sharedTemplates`, ids `shared_<hex>`). Built-in ids always win.
 */
export function findGuidedTemplate(
  id: string,
  shared: readonly Template[] = useGame.getState().data.sharedTemplates,
): Template | undefined {
  return getTemplate(id) ?? shared.find((t) => t.id === id)
}

/** `findGuidedTemplate` for components: re-renders when the shared templates change. */
export function useGuidedTemplate(id: string | undefined): Template | undefined {
  const shared = useGame((s) => s.data.sharedTemplates)
  return id === undefined ? undefined : findGuidedTemplate(id, shared)
}
