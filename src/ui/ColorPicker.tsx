import { COLORS } from '../core/colors'
import { useApp } from '../state/useApp'
import { useEditor } from '../state/useEditor'

/** Right column of 16 big colour swatches. */
export default function ColorPicker() {
  const lang = useApp((s) => s.lang)
  const current = useEditor((s) => s.color)
  const setColor = useEditor((s) => s.setColor)
  return (
    <div className="bt-colors bt-panel" role="group">
      {COLORS.map((c) => (
        <button
          key={c.id}
          className={c.glass ? 'bt-swatch bt-swatch-glass' : 'bt-swatch'}
          style={{ background: c.hex }}
          data-testid={`color-${c.id}`}
          aria-label={c.name[lang]}
          aria-pressed={current === c.id}
          onClick={() => setColor(c.id)}
        />
      ))}
    </div>
  )
}
