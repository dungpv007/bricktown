import { beforeEach, describe, expect, it } from 'vitest'
import { getTemplate } from '../content/templates'
import { createEmptySave } from '../core/serialize'
import { buildModelPackage, decodeShare, encodeShare, type SharePackage } from '../core/share'
import { applyImport, planImport, type ModelImportPlan } from '../core/shareImport'
import { templateToBlueprint } from '../core/template'
import type { Template } from '../core/types'
import { findGuidedTemplate } from './guidedTemplates'
import { useApp } from './useApp'
import { useGame } from './useGame'
import { useGuided } from './useGuided'

const g = () => useGuided.getState()
const data = () => useGame.getState().data

/** The tree, shared "with instructions" by a friend and imported into an empty save. */
function importSharedTree(): Template {
  const sent = buildModelPackage({ ...templateToBlueprint(getTemplate('tree')!, 'vi'), name: 'Cây của An' }, { withSteps: true })
  const pkg = decodeShare(encodeShare(sent)) as SharePackage
  const plan = planImport(data(), pkg) as ModelImportPlan
  useGame.setState({ data: applyImport(data(), plan) })
  return plan.template!
}

beforeEach(() => {
  useGame.setState({ data: createEmptySave() })
  useGuided.setState({ viewStep: 0, errorSeq: 0, celebration: null })
  useApp.setState({ lang: 'vi' })
})

describe('findGuidedTemplate', () => {
  it('finds built-in templates first, then the shared ones', () => {
    const shared = importSharedTree()
    expect(findGuidedTemplate('tree')).toBe(getTemplate('tree'))
    expect(findGuidedTemplate(shared.id)).toEqual(shared)
    expect(findGuidedTemplate('shared_missing')).toBeUndefined()
    const impostor = { ...shared, id: 'tree' } // a shared template can never stand in for a built-in one
    expect(findGuidedTemplate('tree', [impostor])).toBe(getTemplate('tree'))
  })
})

describe('useGuided with a shared template', () => {
  it('builds it step by step like a built-in template and saves the finished model', () => {
    const shared = importSharedTree()
    g().start(shared.id)
    expect(data().guided).toEqual({ templateId: shared.id, step: 0, placed: [] })
    let steps = 0
    while (data().guided) {
      const placed = g().pending().filter((b) => g().placeGhost(b.id)).length
      expect(placed).toBeGreaterThan(0)
      expect(++steps).toBeLessThan(50)
    }
    expect(g().celebration?.templateId).toBe(shared.id)
    expect(data().completedTemplates).toContain(shared.id)
    const finished = data().blueprints.find((b) => b.templateId === shared.id)
    expect(finished?.name).toBe('Cây của An')
  })

  it('resumes a shared build and drops it when the template is gone', () => {
    const shared = importSharedTree()
    g().start(shared.id)
    g().placeGhost(g().pending()[0].id)
    g().resume()
    expect(data().guided?.templateId).toBe(shared.id)
    expect(data().guided?.placed).toHaveLength(1)
    useGame.setState({ data: { ...data(), sharedTemplates: [] } })
    g().resume()
    expect(data().guided).toBeNull()
  })
})
