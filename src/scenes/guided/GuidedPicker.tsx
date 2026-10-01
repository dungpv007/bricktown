import { TEMPLATES } from '../../content/templates'
import type { BlueprintKind, Template } from '../../core/types'
import { useApp } from '../../state/useApp'
import { useGame } from '../../state/useGame'
import { useGuided } from '../../state/useGuided'
import { useT } from '../../ui/i18n'

/** Icon placeholders until real thumbnails arrive: by template id, then by kind + tag, then by kind. */
const ID_ICON: Record<string, string> = {
  tree: '🌳',
  bench: '🪑',
  car: '🚗',
  truck: '🚚',
  house_tall: '🏘️',
}
const TAG_ICON: Record<string, string> = {
  'prop:nature': '🌷',
  'prop:street': '💡',
  'vehicle:police': '🚓',
  'vehicle:fire': '🚒',
  'building:house': '🏠',
  'building:garage': '🅿️',
  'building:police': '👮',
  'building:fire_station': '🧯',
  'building:restaurant': '🍜',
}
const KIND_ICON: Record<BlueprintKind, string> = { building: '🏢', vehicle: '🚙', prop: '🧸' }
const CARD_COLORS = ['var(--bt-green)', 'var(--bt-orange)', 'var(--bt-blue)', 'var(--bt-red)']

const iconOf = (t: Template) =>
  ID_ICON[t.id] ?? t.tags.map((tag) => TAG_ICON[`${t.kind}:${tag}`]).find(Boolean) ?? KIND_ICON[t.kind]

/** Grid of templates to build. Picking the template in progress resumes it; any other starts fresh. */
export default function GuidedPicker({ onPick }: { onPick: () => void }) {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const completed = useGame((s) => s.data.completedTemplates)
  const inProgress = useGame((s) => s.data.guided?.templateId)

  const pick = (id: string) => {
    const g = useGuided.getState()
    if (id === inProgress) g.resume()
    else g.start(id)
    onPick()
  }

  return (
    <div className="bt-guided-picker" data-testid="guided-picker">
      <h2 className="bt-picker-title">{t('guidedPick')}</h2>
      <div className="bt-cards">
        {TEMPLATES.map((tpl, i) => (
          <button
            key={tpl.id}
            className="bt-card bt-tpl-card"
            style={{ background: CARD_COLORS[i % CARD_COLORS.length] }}
            data-testid={`tpl-${tpl.id}`}
            onClick={() => pick(tpl.id)}
          >
            {completed.includes(tpl.id) && (
              <span className="bt-tpl-badge bt-tpl-done" role="img" aria-label={t('guidedCompleted')}>
                ✓
              </span>
            )}
            {inProgress === tpl.id && (
              <span className="bt-tpl-badge bt-tpl-progress" role="img" aria-label={t('guidedInProgress')}>
                ▶
              </span>
            )}
            <span className="bt-card-icon" aria-hidden="true">{iconOf(tpl)}</span>
            {tpl.name[lang]}
            <span className="bt-tpl-stars" aria-label={`${tpl.difficulty}/3`}>
              {'⭐'.repeat(tpl.difficulty)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
