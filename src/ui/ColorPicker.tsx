import type { CSSProperties } from 'react'
import { COLORS, colorMaterialKind, type MaterialKind } from '../core/colors'
import { useApp } from '../state/useApp'
import { useEditor } from '../state/useEditor'

const KIND_ORDER: MaterialKind[] = ['opaque', 'trans', 'metal']

/** Solid colours first, then the see-through ones, then silver and gold (each in id order). */
const PICKER_COLORS = KIND_ORDER.flatMap((kind) => COLORS.filter((c) => colorMaterialKind(c.id) === kind))

const SWATCH_CLASS: Record<MaterialKind, string> = {
  opaque: 'bt-swatch',
  trans: 'bt-swatch bt-swatch-trans',
  metal: 'bt-swatch bt-swatch-metal',
}

/** Right column of big colour swatches (two wide, scrolls when they do not all fit). */
export default function ColorPicker() {
  const lang = useApp((s) => s.lang)
  const current = useEditor((s) => s.color)
  const setColor = useEditor((s) => s.setColor)
  return (
    <div className="bt-colors bt-hud-panel" role="group">
      {PICKER_COLORS.map((c) => (
        <button
          key={c.id}
          className={SWATCH_CLASS[colorMaterialKind(c.id)]}
          style={{ '--bt-swatch-color': c.hex } as CSSProperties}
          data-testid={`color-${c.id}`}
          aria-label={c.name[lang]}
          aria-pressed={current === c.id}
          onClick={() => setColor(c.id)}
        />
      ))}
    </div>
  )
}
