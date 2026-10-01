import { useState } from 'react'
import { TEMPLATES } from '../../content/templates'
import type { Template } from '../../core/types'
import { getThumbnail } from '../../render/thumbnails'
import { useApp } from '../../state/useApp'
import { useGame } from '../../state/useGame'
import { useGuided } from '../../state/useGuided'
import { KIND_ICON } from '../../ui/blueprintKinds'
import ConfirmDialog from '../../ui/ConfirmDialog'
import { useT } from '../../ui/i18n'
import { useThumbnail } from '../../ui/useThumbnail'
import '../../ui/share/share.css'

/** Emoji shown while a thumbnail renders (or when it cannot): by template id, then by kind + tag, then by kind. */
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
  'building:tower': '🏙️',
  'prop:space': '🚀',
  'prop:robot': '🤖',
}
const CARD_COLORS = ['var(--bt-green)', 'var(--bt-orange)', 'var(--bt-blue)', 'var(--bt-red)']

const iconOf = (t: Template) =>
  ID_ICON[t.id] ?? t.tags.map((tag) => TAG_ICON[`${t.kind}:${tag}`]).find(Boolean) ?? KIND_ICON[t.kind]

/** Picture of the finished model; the emoji stands in while it renders or if WebGL is unavailable. */
function TemplateThumb({ template }: { template: Template }) {
  const key = `tpl:${template.id}` // shared ids (`shared_<hex>`) never clash with built-in ones
  const url = useThumbnail(key, () => getThumbnail(key, template.bricks))
  if (!url) return <span className="bt-card-icon" aria-hidden="true">{iconOf(template)}</span>
  return <img className="bt-tpl-thumb" src={url} alt="" draggable={false} />
}

/**
 * Grid of templates to build. Picking the template in progress resumes it; any other starts fresh,
 * which throws the build in progress away, so that asks first.
 */
export default function GuidedPicker({ onPick }: { onPick: () => void }) {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const completed = useGame((s) => s.data.completedTemplates)
  const inProgress = useGame((s) => s.data.guided?.templateId)
  const shared = useGame((s) => s.data.sharedTemplates)

  const [pendingId, setPendingId] = useState<string | null>(null)

  const pick = (id: string) => {
    const g = useGuided.getState()
    if (id === inProgress) g.resume()
    else g.start(id)
    onPick()
  }
  const onCard = (id: string) => {
    if (inProgress !== undefined && id !== inProgress) setPendingId(id)
    else pick(id)
  }

  const card = (tpl: Template, i: number, testId: string) => (
    <button
      key={tpl.id}
      className="bt-card bt-tpl-card"
      style={{ background: CARD_COLORS[i % CARD_COLORS.length] }}
      data-testid={testId}
      onClick={() => onCard(tpl.id)}
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
      <TemplateThumb template={tpl} />
      {tpl.name[lang]}
      <span className="bt-tpl-stars" aria-label={`${tpl.difficulty}/3`}>
        {'⭐'.repeat(tpl.difficulty)}
      </span>
    </button>
  )

  return (
    <div className="bt-guided-picker" data-testid="guided-picker">
      <h2 className="bt-picker-title">{t('guidedPick')}</h2>
      {/* Friends' models first: below the built-in ones they would be far down the list. */}
      {shared.length > 0 && (
        <>
          <h3 className="bt-guided-shared-title" data-testid="guided-shared">
            <span aria-hidden="true">🎁</span> {t('guidedShared')}
          </h3>
          <div className="bt-cards bt-guided-shared-grid">
            {shared.map((tpl, i) => card(tpl, i + 2, `shared-tpl-${tpl.id}`))}
          </div>
        </>
      )}
      <div className="bt-cards">{TEMPLATES.map((tpl, i) => card(tpl, i, `tpl-${tpl.id}`))}</div>
      {pendingId !== null && (
        <ConfirmDialog
          messageKey="confirmReplaceBuild"
          onNo={() => setPendingId(null)}
          onYes={() => {
            const id = pendingId
            setPendingId(null)
            pick(id)
          }}
        />
      )}
    </div>
  )
}
