import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { COLORS, colorMaterialKind, type MaterialKind } from '../core/colors'
import { useApp } from '../state/useApp'
import { useEditor } from '../state/useEditor'
import { useGame } from '../state/useGame'

const KIND_ORDER: MaterialKind[] = ['opaque', 'trans', 'metal']

/** Solid colours first, then the see-through ones, then silver and gold (each in id order). */
const PICKER_COLORS = KIND_ORDER.flatMap((kind) => COLORS.filter((c) => colorMaterialKind(c.id) === kind))

const SWATCH_CLASS: Record<MaterialKind, string> = {
  opaque: 'bt-swatch',
  trans: 'bt-swatch bt-swatch-trans',
  metal: 'bt-swatch bt-swatch-metal',
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

/** The colour of the selected Workshop brick (a figure's torso), or null without a selection. */
function useSelectedColor(enabled: boolean): number | null {
  const id = useEditor((s) => (enabled ? s.selectedId : null))
  return useGame((s) => (id === null ? null : (s.data.workshop.bricks.find((b) => b.id === id)?.c ?? null)))
}

/**
 * Right column of big colour swatches (two wide, scrolls when they do not all fit, with a cue).
 * With `recolorsSelection` (Workshop), a swatch recolours the selected brick while one is
 * selected; otherwise it sets the colour of new bricks.
 */
export default function ColorPicker({ recolorsSelection = false }: { recolorsSelection?: boolean }) {
  const lang = useApp((s) => s.lang)
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
  return (
    <div ref={panel} className="bt-colors bt-hud-panel" role="group">
      {PICKER_COLORS.map((c) => (
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
      {more && (
        <div className="bt-colors-more" data-testid="colors-more" aria-hidden="true">
          <span>▼</span>
        </div>
      )}
    </div>
  )
}
