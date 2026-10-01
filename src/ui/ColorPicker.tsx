import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { COLORS, colorMaterialKind, type MaterialKind } from '../core/colors'
import { colorsCollapsed, useApp } from '../state/useApp'
import { useEditor } from '../state/useEditor'
import { useGame } from '../state/useGame'
import { currentDeviceClass, useDeviceClass } from '../state/deviceClass'
import { useT } from './i18n'

const KIND_ORDER: MaterialKind[] = ['opaque', 'trans', 'metal']

/** Solid colours first, then the see-through ones, then silver and gold (each in id order). */
const PICKER_COLORS = KIND_ORDER.flatMap((kind) => COLORS.filter((c) => colorMaterialKind(c.id) === kind))

const SWATCH_CLASS: Record<MaterialKind, string> = {
  opaque: 'bt-swatch',
  trans: 'bt-swatch bt-swatch-trans',
  metal: 'bt-swatch bt-swatch-metal',
}

/** The look of the folded picker's colour dot (the swatch look without the swatch's size and border). */
const DOT_CLASS: Record<MaterialKind, string> = {
  opaque: 'bt-colors-dot',
  trans: 'bt-colors-dot bt-swatch-trans',
  metal: 'bt-colors-dot bt-swatch-metal',
}

/** Pixels of slack before the column counts as scrolled to the end. */
const END_SLACK = 4

/** True while part of the scrollable element's content is hidden below its visible area. */
function useMoreBelow(ref: RefObject<HTMLElement | null>): boolean {
  const [more, setMore] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setMore(el.scrollTop + el.clientHeight < el.scrollHeight - END_SLACK)
    update()
    el.addEventListener('scroll', update, { passive: true })
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    resize?.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      resize?.disconnect()
    }
  }, [ref])
  return more
}

const HINT_CLASS = 'bt-colors-hint'
const HINT_MS = 1600

/**
 * Each `hintColors()` (the action bar's 🎨) unfolds the picker if it is folded, makes it pulse for
 * a moment and scrolls the pressed swatch into view, so kids find where recolouring happens.
 */
function useColorHint(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = useEditor.subscribe((s, prev) => {
      const el = ref.current
      if (!el || s.colorHintSeq === prev.colorHintSeq) return
      const app = useApp.getState()
      const deviceClass = currentDeviceClass()
      if (colorsCollapsed(app, deviceClass)) app.setColorsCollapsed(deviceClass, false)
      el.classList.remove(HINT_CLASS)
      void el.offsetWidth // restart the animation on repeated hints
      el.classList.add(HINT_CLASS)
      // After the swatches of an unfolded picker are drawn.
      requestAnimationFrame(() =>
        el.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
      )
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => el.classList.remove(HINT_CLASS), HINT_MS)
    })
    return () => {
      unsubscribe()
      if (timer !== null) clearTimeout(timer)
    }
  }, [ref, enabled])
}

/** The colour of the selected Workshop brick (a figure's torso), or null without a selection. */
function useSelectedColor(enabled: boolean): number | null {
  const id = useEditor((s) => (enabled ? s.selectedId : null))
  return useGame((s) => (id === null ? null : (s.data.workshop.bricks.find((b) => b.id === id)?.c ?? null)))
}

/**
 * Right column of big colour swatches (two wide, scrolls when they do not all fit, with a cue).
 * With `recolorsSelection` (Workshop), a swatch recolours the selected brick while one is
 * selected (and becomes the colour for new bricks too); otherwise it sets the colour of new bricks.
 * The round button on top showing the current colour folds the column away (and back); folded or
 * not is remembered per device class, folded by default on portrait phones.
 */
export default function ColorPicker({ recolorsSelection = false }: { recolorsSelection?: boolean }) {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const deviceClass = useDeviceClass()
  const collapsed = useApp((s) => colorsCollapsed(s, deviceClass))
  const color = useEditor((s) => s.color)
  const selectedColor = useSelectedColor(recolorsSelection)
  const current = selectedColor ?? color
  const pick = (c: number) => {
    const ed = useEditor.getState()
    if (selectedColor !== null) ed.paintSelected(c)
    else ed.setColor(c)
  }
  const panel = useRef<HTMLDivElement>(null)
  const more = useMoreBelow(panel)
  useColorHint(panel, recolorsSelection)
  const currentHex = COLORS[current]?.hex ?? '#ffffff'
  return (
    <div ref={panel} className="bt-colors bt-hud-panel" role="group" aria-label={t('colorPicker')} data-collapsed={collapsed}>
      <button
        className="bt-btn bt-colors-toggle"
        data-testid="colors-toggle"
        aria-label={t('colorPicker')}
        aria-expanded={!collapsed}
        onClick={() => useApp.getState().setColorsCollapsed(deviceClass, !collapsed)}
      >
        <span
          className={DOT_CLASS[colorMaterialKind(current)]}
          style={{ '--bt-swatch-color': currentHex } as CSSProperties}
          aria-hidden="true"
        />
        <span className="bt-colors-caret" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && PICKER_COLORS.map((c) => (
        <button
          key={c.id}
          className={SWATCH_CLASS[colorMaterialKind(c.id)]}
          style={{ '--bt-swatch-color': c.hex } as CSSProperties}
          data-testid={`color-${c.id}`}
          aria-label={c.name[lang]}
          aria-pressed={current === c.id}
          onClick={() => pick(c.id)}
        />
      ))}
      {!collapsed && more && (
        <div className="bt-colors-more" data-testid="colors-more" aria-hidden="true">
          <span>▼</span>
        </div>
      )}
    </div>
  )
}
