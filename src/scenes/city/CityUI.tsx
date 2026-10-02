import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TEMPLATES } from '../../content/templates'
import { buildCityPackage } from '../../core/share'
import type { Blueprint, Template } from '../../core/types'
import { usePaletteDrag } from '../../input/paletteDrag'
import { getThumbnail } from '../../render/thumbnails'
import { isTemplateSource, resolveRenderable, templateSource } from '../../render/sources'
import { useApp } from '../../state/useApp'
import { useCityEditor } from '../../state/useCityEditor'
import { useEditor, workshopHasBricks } from '../../state/useEditor'
import { useGame } from '../../state/useGame'
import { KIND_ICON } from '../../ui/blueprintKinds'
import ConfirmDialog from '../../ui/ConfirmDialog'
import ErrorBadge from '../../ui/ErrorBadge'
import { useT, type TKey } from '../../ui/i18n'
import ShareDialog from '../../ui/share/ShareDialog'
import { useThumbnail } from '../../ui/useThumbnail'

/** Left column, top: road mode (with its eraser while on), then undo / redo. */
function CityToolbar() {
  const t = useT()
  const roadMode = useCityEditor((s) => s.roadMode)
  const roadTool = useCityEditor((s) => s.roadTool)
  const setRoadMode = useCityEditor((s) => s.setRoadMode)
  const setRoadTool = useCityEditor((s) => s.setRoadTool)
  const undo = useCityEditor((s) => s.undo)
  const redo = useCityEditor((s) => s.redo)
  const canUndo = useCityEditor((s) => s.canUndo)
  const canRedo = useCityEditor((s) => s.canRedo)
  return (
    <div className="bt-toolbar bt-hud-panel" role="toolbar" aria-orientation="vertical">
      <button
        className="bt-btn bt-icon-btn"
        data-testid="city-road-mode"
        aria-label={t('cityToolRoad')}
        aria-pressed={roadMode}
        onClick={() => setRoadMode(!roadMode)}
      >
        🛣️
      </button>
      {roadMode && (
        <button
          className="bt-btn bt-icon-btn"
          data-testid="city-road-eraser"
          aria-label={t('cityRoadEraser')}
          aria-pressed={roadTool === 'erase'}
          onClick={() => setRoadTool(roadTool === 'erase' ? 'paint' : 'erase')}
        >
          🧽
        </button>
      )}
      <div className="bt-toolbar-sep" aria-hidden="true" />
      <button className="bt-btn bt-icon-btn" data-testid="city-undo" aria-label={t('toolUndo')} disabled={!canUndo} onClick={undo}>
        ↶
      </button>
      <button className="bt-btn bt-icon-btn" data-testid="city-redo" aria-label={t('toolRedo')} disabled={!canRedo} onClick={redo}>
        ↷
      </button>
    </div>
  )
}

type CityAction = 'rotate' | 'duplicate' | 'delete' | 'edit' | 'deselect'

const ACTIONS: Array<{ action: CityAction; icon: string; labelKey: TKey }> = [
  { action: 'rotate', icon: '↻', labelKey: 'actRotate' },
  { action: 'duplicate', icon: '📋', labelKey: 'actDuplicate' },
  { action: 'delete', icon: '🗑️', labelKey: 'actDelete' },
  { action: 'edit', icon: '✏️', labelKey: 'cityEdit' },
  { action: 'deselect', icon: '✕', labelKey: 'actDeselect' },
]

/**
 * What can be done to the selected placement, in the Workshop action bar's look. ✏️ shows only for
 * the kid's own blueprints (templates are not editable), 📋 only for models that can be drawn (a grey
 * placeholder is never copied).
 */
function CityActionBar(props: { editable: Blueprint | null; drawable: boolean; onEdit: (bp: Blueprint) => void }) {
  const { editable, drawable, onEdit } = props
  const t = useT()
  const run = (action: CityAction) => {
    const ed = useCityEditor.getState()
    switch (action) {
      case 'rotate': return ed.rotateSelected()
      case 'duplicate': return ed.duplicateSelected()
      case 'delete': return ed.deleteSelected()
      case 'edit': return editable && onEdit(editable)
      case 'deselect': return ed.selectPlacement(null)
    }
  }
  return (
    <div className="bt-actionbar bt-hud-panel" role="toolbar" aria-orientation="vertical" data-testid="city-action-bar">
      {ACTIONS.filter(({ action }) => (action !== 'edit' || editable) && (action !== 'duplicate' || drawable)).map(({ action, icon, labelKey }) => (
        <button
          key={action}
          className={`bt-btn bt-icon-btn bt-act-${action}`}
          data-testid={`city-act-${action}`}
          aria-label={t(labelKey)}
          onClick={() => run(action)}
        >
          {icon}
        </button>
      ))}
    </div>
  )
}

function TemplateCard({ template, selected }: { template: Template; selected: boolean }) {
  const lang = useApp((s) => s.lang)
  const key = `tpl:${template.id}`
  const url = useThumbnail(key, () => getThumbnail(key, template.bricks))
  return (
    <SourceCard
      testId={`src-tpl-${template.id}`}
      name={template.name[lang]}
      icon={KIND_ICON[template.kind]}
      url={url}
      source={templateSource(template.id)}
      selected={selected}
    />
  )
}

function BlueprintCard({ blueprint, selected }: { blueprint: Blueprint; selected: boolean }) {
  // Same key as the blueprint library, so both share one rendered picture.
  const key = `bp:${blueprint.id}:${blueprint.updatedAt}`
  const url = useThumbnail(key, () => getThumbnail(key, blueprint.bricks))
  return (
    <SourceCard
      testId={`src-${blueprint.id}`}
      name={blueprint.name}
      icon={KIND_ICON[blueprint.kind]}
      url={url}
      source={blueprint.id}
      selected={selected}
    />
  )
}

/**
 * A Kho card. A tap picks it as the source a tap on the empty ground quick-places (tapping it again
 * unpicks it); dragged up onto the map, it places a copy where it is dropped.
 */
function SourceCard(props: { testId: string; name: string; icon: string; url: string; source: string; selected: boolean }) {
  const { testId, name, icon, url, source, selected } = props
  // The click that follows a drag's release must not also pick (or unpick) the card.
  const dragged = useRef(false)
  const startDrag = usePaletteDrag(() => {
    dragged.current = true
    useCityEditor.getState().setDraggedSource(source)
  })
  return (
    <button
      className="bt-btn bt-source-card bt-part-drag"
      data-testid={testId}
      aria-label={name}
      aria-pressed={selected}
      onPointerDown={(e) => {
        dragged.current = false
        startDrag(e)
      }}
      onClick={() => {
        if (dragged.current) dragged.current = false
        else useCityEditor.getState().selectSource(source)
      }}
    >
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
          {TEMPLATES.map((tpl) => (
            <TemplateCard key={tpl.id} template={tpl} selected={selectedSource === templateSource(tpl.id)} />
          ))}
          {newestFirst.length > 0 && <div className="bt-city-sources-sep" aria-hidden="true" />}
          {newestFirst.map((bp) => (
            <BlueprintCard key={bp.id} blueprint={bp} selected={selectedSource === bp.id} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Shares the whole city with the models it uses (an empty city has nothing to share). */
function ShareCity() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const empty = useGame((s) => s.data.city.placements.length === 0 && s.data.city.roads.length === 0)
  const build = useCallback(() => {
    const { city, blueprints } = useGame.getState().data
    return buildCityPackage(city, blueprints, { name: t('shareCityName') })
  }, [t])
  return (
    <>
      <button
        className="bt-btn bt-icon-btn"
        data-testid="share-city"
        aria-label={empty ? t('shareCityEmpty') : t('share')}
        disabled={empty}
        onClick={() => setOpen(true)}
      >
        🔗
      </button>
      {open && <ShareDialog build={build} icon="🏙️" onClose={() => setOpen(false)} />}
    </>
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
  const selected = useMemo(() => placements.find((q) => q.id === selectedPlacementId) ?? null, [placements, selectedPlacementId])
  // The blueprint behind the selected placement, if it is one of the kid's (templates are not editable here).
  const editable = useMemo(
    () => (selected && !isTemplateSource(selected.source) ? (blueprints.find((b) => b.id === selected.source) ?? null) : null),
    [selected, blueprints],
  )
  const drawable = useMemo(() => selected !== null && resolveRenderable(selected.source, { blueprints }) !== null, [selected, blueprints])

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
    else if (workshopHasBricks()) setPendingEdit(bp) // opening replaces the model in progress
    else openInWorkshop(bp)
  }

  return (
    <div className="bt-city-ui">
      <div className="bt-topright">
        <ShareCity />
        <button className="bt-btn bt-city-drive" data-testid="city-drive" aria-label={t('menuDrive')} onClick={() => setMode('drive')}>
          <span aria-hidden="true">🚗</span> {t('menuDrive')}
        </button>
      </div>
      <div className="bt-city-left">
        <CityToolbar />
        {selected && <CityActionBar editable={editable} drawable={drawable} onEdit={onEdit} />}
      </div>
      <SourceDrawer />
      <ErrorBadge errorSeq={errorSeq} testId="city-error" />
      {pendingEdit && (
        <ConfirmDialog messageKey="confirmReplaceModel" onYes={() => openInWorkshop(pendingEdit)} onNo={() => setPendingEdit(null)} />
      )}
    </div>
  )
}
