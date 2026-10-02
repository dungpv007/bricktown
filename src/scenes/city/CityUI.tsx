import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TEMPLATES } from '../../content/templates'
import { cityDisplayName, cityIsEmpty, currentCity, currentSavedCity } from '../../core/cities'
import { MAX_SCALE, MIN_SCALE, scaleOf } from '../../core/city'
import { buildCityPackage } from '../../core/share'
import { CITY_TIME_ICONS, nextTime, type CityTime } from '../../core/timeOfDay'
import type { TerrainBrush } from '../../core/terrain'
import type { Blueprint, Template } from '../../core/types'
import { usePaletteDrag } from '../../input/paletteDrag'
import { getThumbnail } from '../../render/thumbnails'
import { isTemplateSource, resolveRenderable, templateSource } from '../../render/sources'
import { useDeviceClass } from '../../state/deviceClass'
import { prefersReducedMotion, useApp } from '../../state/useApp'
import { useCityEditor, type PaintLayer } from '../../state/useCityEditor'
import { useEditor, workshopHasBricks } from '../../state/useEditor'
import { useGame } from '../../state/useGame'
import { useGraphics } from '../../state/useGraphics'
import { KIND_ICON } from '../../ui/blueprintKinds'
import ConfirmDialog from '../../ui/ConfirmDialog'
import ErrorBadge from '../../ui/ErrorBadge'
import { useT, type TKey } from '../../ui/i18n'
import ShareDialog from '../../ui/share/ShareDialog'
import TopRight from '../../ui/TopRight'
import { useThumbnail } from '../../ui/useThumbnail'
import CityPickerButton from './CityPicker'

const PAINT_TOOLS: Array<{ layer: PaintLayer; icon: string; labelKey: TKey; eraserKey?: TKey }> = [
  { layer: 'road', icon: '🛣️', labelKey: 'cityToolRoad', eraserKey: 'cityRoadEraser' },
  { layer: 'rail', icon: '🛤️', labelKey: 'cityToolRail', eraserKey: 'cityRailEraser' },
  { layer: 'terrain', icon: '🏞️', labelKey: 'cityToolTerrain' },
]

const TERRAIN_BRUSH_UI: Array<{ brush: TerrainBrush; icon: string; labelKey: TKey }> = [
  { brush: 'water', icon: '💧', labelKey: 'terrainWater' },
  { brush: 'pavement', icon: '⬜', labelKey: 'terrainPavement' },
  { brush: 'sand', icon: '🟨', labelKey: 'terrainSand' },
  { brush: 'grass', icon: '🟩', labelKey: 'terrainGrass' },
]

/**
 * Left column, top: the painting tools (roads, rails, terrain), each followed while it is on by its
 * own choices (the 🧽 eraser; the terrain brushes), then undo / redo. Scrolls when it is taller than
 * the screen.
 */
function CityToolbar() {
  const t = useT()
  const paintLayer = useCityEditor((s) => s.paintLayer)
  const roadTool = useCityEditor((s) => s.roadTool)
  const terrainBrush = useCityEditor((s) => s.terrainBrush)
  const setPaintLayer = useCityEditor((s) => s.setPaintLayer)
  const setRoadTool = useCityEditor((s) => s.setRoadTool)
  const setTerrainBrush = useCityEditor((s) => s.setTerrainBrush)
  const undo = useCityEditor((s) => s.undo)
  const redo = useCityEditor((s) => s.redo)
  const canUndo = useCityEditor((s) => s.canUndo)
  const canRedo = useCityEditor((s) => s.canRedo)
  return (
    <div className="bt-toolbar bt-hud-panel" role="toolbar" aria-orientation="vertical" data-testid="city-toolbar">
      {PAINT_TOOLS.map(({ layer, icon, labelKey, eraserKey }) => (
        <Fragment key={layer}>
          <button
            className="bt-btn bt-icon-btn"
            data-testid={`city-${layer}-mode`}
            aria-label={t(labelKey)}
            aria-pressed={paintLayer === layer}
            onClick={() => setPaintLayer(paintLayer === layer ? null : layer)}
          >
            {icon}
          </button>
          {paintLayer === layer && eraserKey && (
            <button
              className="bt-btn bt-icon-btn bt-city-subtool"
              data-testid={`city-${layer}-eraser`}
              aria-label={t(eraserKey)}
              aria-pressed={roadTool === 'erase'}
              onClick={() => setRoadTool(roadTool === 'erase' ? 'paint' : 'erase')}
            >
              🧽
            </button>
          )}
          {paintLayer === layer &&
            layer === 'terrain' &&
            TERRAIN_BRUSH_UI.map(({ brush, icon: brushIcon, labelKey: brushKey }) => (
              <button
                key={brush}
                className="bt-btn bt-icon-btn bt-city-subtool"
                data-testid={`city-terrain-${brush}`}
                aria-label={t(brushKey)}
                aria-pressed={terrainBrush === brush}
                onClick={() => setTerrainBrush(brush)}
              >
                {brushIcon}
              </button>
            ))}
        </Fragment>
      ))}
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
 * Size of the selected model, x1..x10: − (smaller), the "×N" label, + (bigger), each tap one undo
 * step. Its own panel beside the action bar (tablets: a second column, + on top; phones: a row, next
 * to the actions or under them when they do not fit), so the bar's ✕ never scrolls away.
 */
function CityScaleControl({ scale }: { scale: number }) {
  const t = useT()
  const scaleBy = (delta: 1 | -1) => useCityEditor.getState().scaleSelected(delta)
  return (
    <div className="bt-actionbar bt-hud-panel bt-city-scale" role="group" aria-label={t('cityScale')} data-testid="city-scale">
      <button
        className="bt-btn bt-icon-btn"
        data-testid="city-scale-down"
        aria-label={t('cityScaleDown')}
        disabled={scale <= MIN_SCALE}
        onClick={() => scaleBy(-1)}
      >
        −
      </button>
      <div className="bt-city-scale-value">
        <span aria-hidden="true">📏</span>
        <span data-testid="city-scale-label" aria-live="polite">
          ×{scale}
        </span>
      </div>
      <button
        className="bt-btn bt-icon-btn"
        data-testid="city-scale-up"
        aria-label={t('cityScaleUp')}
        disabled={scale >= MAX_SCALE}
        onClick={() => scaleBy(1)}
      >
        +
      </button>
    </div>
  )
}

/**
 * What can be done to the selected placement, in the Workshop action bar's look, and its size. ✏️
 * shows only for the kid's own blueprints (templates are not editable), 📋 only for models that can
 * be drawn (a grey placeholder is never copied).
 */
function CityActionBar(props: { editable: Blueprint | null; drawable: boolean; scale: number; onEdit: (bp: Blueprint) => void }) {
  const { editable, drawable, scale, onEdit } = props
  const t = useT()
  const phone = useDeviceClass() !== 'tablet' // a row under the tools on phones (theme.css)
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
    <div className="bt-city-actions" role="toolbar" aria-orientation={phone ? 'horizontal' : 'vertical'} data-testid="city-action-bar">
      <div className="bt-actionbar bt-hud-panel">
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
      <CityScaleControl scale={scale} />
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
  const startDrag = usePaletteDrag(
    () => {
      dragged.current = true
      useCityEditor.getState().setDraggedSource(source)
    },
    { cancelOnSecondPointer: true },
  )
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

/** Shares the city being played with the models it uses (an empty city has nothing to share). */
function ShareCity() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const empty = useGame((s) => cityIsEmpty(currentCity(s.data)))
  const build = useCallback(() => {
    const { data } = useGame.getState()
    const saved = currentSavedCity(data)
    return buildCityPackage(saved.city, data.blueprints, { name: cityDisplayName(saved, t('cityDefaultName')) })
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

/** 🚦 Ambient life (cars, trains, people) on or off; remembered with the other preferences. */
function NpcToggle() {
  const t = useT()
  const on = useApp((s) => s.npcOn)
  const setOn = useApp((s) => s.setNpcOn)
  return (
    <button className="bt-btn bt-icon-btn" data-testid="city-npc-toggle" aria-label={t('cityNpc')} aria-pressed={on} onClick={() => setOn(!on)}>
      🚦
    </button>
  )
}

const TIME_LABEL: Record<CityTime, TKey> = { morning: 'cityTimeMorning', noon: 'cityTimeNoon', sunset: 'cityTimeSunset', night: 'cityTimeNight' }

/**
 * Time of day: the 🕒 button steps through ☀️ 🌞 🌅 🌙 (and stops the automatic day); the 🔄 toggle
 * runs the automatic day, offered only when the graphics settings allow it and motion is welcome.
 */
function TimeControls() {
  const t = useT()
  const time = useApp((s) => s.cityTime)
  const auto = useApp((s) => s.cityTimeAuto)
  const allowed = useGraphics().autoDayNight
  const [reduced] = useState(prefersReducedMotion)
  const offered = allowed && !reduced
  const pick = () => {
    const app = useApp.getState()
    if (app.cityTimeAuto) app.setCityTimeAuto(false)
    app.setCityTime(nextTime(app.cityTime))
  }
  return (
    <>
      <button
        className="bt-btn bt-icon-btn"
        data-testid="city-time"
        data-time={time}
        aria-label={t(TIME_LABEL[time])}
        title={t(TIME_LABEL[time])}
        onClick={pick}
      >
        {CITY_TIME_ICONS[time]}
      </button>
      {offered && (
        <button
          className="bt-btn bt-icon-btn"
          data-testid="city-time-auto"
          aria-label={t('cityTimeAuto')}
          title={t('cityTimeAuto')}
          aria-pressed={auto}
          onClick={() => useApp.getState().setCityTimeAuto(!auto)}
        >
          🔄
        </button>
      )}
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
  const placements = useGame((s) => currentCity(s.data).placements)
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
      <TopRight>
        <TimeControls />
        <NpcToggle />
        <CityPickerButton />
        <ShareCity />
        <button className="bt-btn bt-city-drive" data-testid="city-drive" aria-label={t('menuDrive')} onClick={() => setMode('drive')}>
          <span aria-hidden="true">🚗</span> {t('menuDrive')}
        </button>
      </TopRight>
      <div className="bt-city-left">
        <CityToolbar />
        {selected && <CityActionBar editable={editable} drawable={drawable} scale={scaleOf(selected)} onEdit={onEdit} />}
      </div>
      <SourceDrawer />
      <ErrorBadge errorSeq={errorSeq} testId="city-error" />
      {pendingEdit && (
        <ConfirmDialog messageKey="confirmReplaceModel" onYes={() => openInWorkshop(pendingEdit)} onNo={() => setPendingEdit(null)} />
      )}
    </div>
  )
}
