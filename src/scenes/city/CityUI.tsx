import { useEffect, useMemo, useState } from 'react'
import { TEMPLATES } from '../../content/templates'
import type { Blueprint, Template } from '../../core/types'
import { getThumbnail } from '../../render/thumbnails'
import { isTemplateSource, templateSource } from '../../render/sources'
import { useApp } from '../../state/useApp'
import { useCityEditor, type CityTool } from '../../state/useCityEditor'
import { useEditor, workshopHasBricks } from '../../state/useEditor'
import { useGame } from '../../state/useGame'
import { KIND_ICON } from '../../ui/blueprintKinds'
import ConfirmDialog from '../../ui/ConfirmDialog'
import ErrorBadge from '../../ui/ErrorBadge'
import { useT, type TKey } from '../../ui/i18n'
import { useThumbnail } from '../../ui/useThumbnail'

const TOOLS: Array<{ tool: CityTool; icon: string; labelKey: TKey }> = [
  { tool: 'road', icon: '🛣️', labelKey: 'cityToolRoad' },
  { tool: 'place', icon: '🏠', labelKey: 'cityToolPlace' },
  { tool: 'erase', icon: '🗑️', labelKey: 'toolDelete' },
  { tool: 'rotate', icon: '🔄', labelKey: 'toolRotate' },
]

function CityToolbar() {
  const t = useT()
  const current = useCityEditor((s) => s.tool)
  const setTool = useCityEditor((s) => s.setTool)
  const undo = useCityEditor((s) => s.undo)
  const canUndo = useCityEditor((s) => s.canUndo)
  return (
    <div className="bt-toolbar bt-hud-panel" role="toolbar" aria-orientation="vertical">
      {TOOLS.map(({ tool, icon, labelKey }) => (
        <button
          key={tool}
          className="bt-btn bt-icon-btn"
          data-testid={`city-tool-${tool}`}
          aria-label={t(labelKey)}
          aria-pressed={current === tool}
          onClick={() => setTool(tool)}
        >
          {icon}
        </button>
      ))}
      <div className="bt-toolbar-sep" aria-hidden="true" />
      <button className="bt-btn bt-icon-btn" data-testid="city-undo" aria-label={t('toolUndo')} disabled={!canUndo} onClick={undo}>
        ↶
      </button>
    </div>
  )
}

function TemplateCard({ template, selected, onPick }: { template: Template; selected: boolean; onPick: () => void }) {
  const lang = useApp((s) => s.lang)
  const key = `tpl:${template.id}`
  const url = useThumbnail(key, () => getThumbnail(key, template.bricks))
  return (
    <SourceCard
      testId={`src-tpl-${template.id}`}
      name={template.name[lang]}
      icon={KIND_ICON[template.kind]}
      url={url}
      selected={selected}
      onPick={onPick}
    />
  )
}

function BlueprintCard({ blueprint, selected, onPick }: { blueprint: Blueprint; selected: boolean; onPick: () => void }) {
  // Same key as the blueprint library, so both share one rendered picture.
  const key = `bp:${blueprint.id}:${blueprint.updatedAt}`
  const url = useThumbnail(key, () => getThumbnail(key, blueprint.bricks))
  return (
    <SourceCard
      testId={`src-${blueprint.id}`}
      name={blueprint.name}
      icon={KIND_ICON[blueprint.kind]}
      url={url}
      selected={selected}
      onPick={onPick}
    />
  )
}

function SourceCard(props: { testId: string; name: string; icon: string; url: string; selected: boolean; onPick: () => void }) {
  const { testId, name, icon, url, selected, onPick } = props
  return (
    <button className="bt-btn bt-source-card" data-testid={testId} aria-label={name} aria-pressed={selected} onClick={onPick}>
      {url ? (
        <img className="bt-source-thumb" src={url} alt="" draggable={false} />
      ) : (
        <span className="bt-source-thumb bt-source-fallback" aria-hidden="true">{icon}</span>
      )}
      <span className="bt-source-name">{name}</span>
    </button>
  )
}

/** Bottom drawer "Kho": ready-made templates first, then the kid's own blueprints. */
function SourceDrawer() {
  const t = useT()
  const [open, setOpen] = useState(true)
  const blueprints = useGame((s) => s.data.blueprints)
  const selectedSource = useCityEditor((s) => s.selectedSource)
  const selectSource = useCityEditor((s) => s.selectSource)
  const newestFirst = [...blueprints].sort((a, b) => b.updatedAt - a.updatedAt)
  return (
    <div className={`bt-city-drawer bt-hud-panel${open ? '' : ' bt-city-drawer-closed'}`} data-testid="city-drawer">
      <button
        className="bt-btn bt-city-drawer-toggle"
        data-testid="city-drawer-toggle"
        aria-label={t('cityDrawer')}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">📦</span> {t('cityDrawer')} <span aria-hidden="true">{open ? '▾' : '▴'}</span>
      </button>
      {open && (
        <div className="bt-city-sources">
          {TEMPLATES.map((tpl) => {
            const source = templateSource(tpl.id)
            return (
              <TemplateCard key={tpl.id} template={tpl} selected={selectedSource === source} onPick={() => selectSource(source)} />
            )
          })}
          {newestFirst.length > 0 && <div className="bt-city-sources-sep" aria-hidden="true" />}
          {newestFirst.map((bp) => (
            <BlueprintCard key={bp.id} blueprint={bp} selected={selectedSource === bp.id} onPick={() => selectSource(bp.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

/** HTML overlay on top of the city canvas. */
export default function CityUI() {
  const t = useT()
  const errorSeq = useCityEditor((s) => s.errorSeq)
  const setMode = useApp((s) => s.setMode)
  const loadBricks = useEditor((s) => s.loadBricks)
  const [pendingEdit, setPendingEdit] = useState<Blueprint | null>(null)
  const selectedPlacementId = useCityEditor((s) => s.selectedPlacementId)
  const placements = useGame((s) => s.data.city.placements)
  const blueprints = useGame((s) => s.data.blueprints)
  // The blueprint behind the tapped placement, if it is one of the kid's (templates are not editable here).
  const editable = useMemo(() => {
    const p = placements.find((q) => q.id === selectedPlacementId)
    return p && !isTemplateSource(p.source) ? (blueprints.find((b) => b.id === p.source) ?? null) : null
  }, [placements, blueprints, selectedPlacementId])

  // Undo must not reach back into another visit (or another save slot).
  useEffect(() => useCityEditor.getState().reset(), [])

  const openInWorkshop = (bp: Blueprint) => {
    loadBricks(bp.bricks, bp.kind, bp.baseplate, bp.id)
    setPendingEdit(null)
    setMode('workshop')
  }
  const onEdit = (bp: Blueprint) => {
    const { workshop } = useGame.getState().data
    if (workshop.editingBlueprintId === bp.id) setMode('workshop') // already open there: keep unsaved edits
    else if (workshopHasBricks()) setPendingEdit(bp) // opening replaces the model in progress (a carried brick counts)
    else openInWorkshop(bp)
  }

  return (
    <div className="bt-city-ui">
      <div className="bt-topright">
        {editable && (
          <button className="bt-btn bt-icon-btn" data-testid="city-edit" aria-label={t('cityEdit')} onClick={() => onEdit(editable)}>
            ✏️
          </button>
        )}
        <button className="bt-btn bt-city-drive" data-testid="city-drive" aria-label={t('menuDrive')} onClick={() => setMode('drive')}>
          <span aria-hidden="true">🚗</span> {t('menuDrive')}
        </button>
      </div>
      <CityToolbar />
      <SourceDrawer />
      <ErrorBadge errorSeq={errorSeq} testId="city-error" />
      {pendingEdit && (
        <ConfirmDialog messageKey="confirmReplaceModel" onYes={() => openInWorkshop(pendingEdit)} onNo={() => setPendingEdit(null)} />
      )}
    </div>
  )
}
