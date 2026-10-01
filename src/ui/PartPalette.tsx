import type { ReactNode } from 'react'
import { COLORS } from '../core/colors'
import { FIG_PRESETS, MINIFIG_PART, figKey } from '../core/figures'
import { PART_CATEGORIES, PARTS } from '../core/parts/catalog'
import type { PartCategory, PartDef, PartShape } from '../core/types'
import { useApp } from '../state/useApp'
import { useEditor } from '../state/useEditor'
import { getPartThumbnail } from '../render/thumbnails'
import { FigureImage } from './FigureEditor'
import { useT, type TKey } from './i18n'
import { useThumbnail } from './useThumbnail'

const CATEGORY_TABS: Record<PartCategory, { icon: string; labelKey: TKey }> = {
  brick: { icon: '🧱', labelKey: 'catBrick' },
  plate: { icon: '▬', labelKey: 'catPlate' },
  slope: { icon: '◢', labelKey: 'catSlope' },
  round: { icon: '⚪', labelKey: 'catRound' },
  door_window: { icon: '🚪', labelKey: 'catDoorWindow' },
  wheel: { icon: '🛞', labelKey: 'catWheel' },
  furniture: { icon: '🪑', labelKey: 'catFurniture' },
  nature: { icon: '🌳', labelKey: 'catNature' },
  decor: { icon: '🖼️', labelKey: 'catDecor' },
  figure: { icon: '🧑', labelKey: 'catFigure' },
}

/** Shapes without a simple silhouette get an emoji (fallback while a thumbnail renders, and in compact lists). */
const SHAPE_EMOJI: Partial<Record<PartShape, string>> = {
  wheel: '🛞', window: '🪟', door: '🚪', fence: '🚧', table: '🪑', chair: '🪑', counter: '🗄️',
  stove: '🍳', fridge: '🧊', sign: '🪧', lamp: '💡', tree: '🌳', bush: '🌿', flower: '🌷',
  nose_cone: '🚀', dish: '📡', antenna: '📶', bars: '⛓️', steering: '🛞', computer: '💻', bed: '🛏️',
  flag: '🚩', fin: '🚀', engine: '🔥', tile_print: '🖼️', minifig: '🧑',
}

/** Printed tiles show their picture (fallback while the thumbnail renders, and in the rotate button). */
const PRINT_EMOJI: Record<string, string> = {
  police: '🚓', fire: '🚒', clock: '🕙', stop: '🛑', arrow: '➡️', menu: '📋', screen: '🖥️',
  robot_eyes: '🤖', number_112: '🔢', heart: '❤️', star: '⭐',
}

const ICON = 44
const STROKE = 'rgba(0,0,0,0.35)'

/** Small SVG silhouette of a part: top view for boxes / round parts, side view for slopes. */
export function PartIcon({ part, color }: { part: PartDef; color: string }) {
  const emoji = (part.print && PRINT_EMOJI[part.print]) || SHAPE_EMOJI[part.shape]
  if (emoji) return <span className="bt-part-emoji" aria-hidden="true">{emoji}</span>

  const cell = Math.min(10, (ICON - 4) / Math.max(part.w, part.d))
  const pw = part.w * cell
  const pd = part.d * cell
  const ox = (ICON - pw) / 2
  const oy = (ICON - pd) / 2
  let body: ReactNode
  switch (part.shape) {
    case 'slope':
    case 'slope_inv': {
      // Side view along X: depth on the horizontal axis, height on the vertical axis.
      const h = Math.min(ICON - 8, part.d * 10)
      const x0 = (ICON - pd) / 2
      const y0 = (ICON - h) / 2
      const pts =
        part.shape === 'slope'
          ? `${x0},${y0 + h} ${x0},${y0} ${x0 + cell},${y0} ${x0 + pd},${y0 + h * 0.8} ${x0 + pd},${y0 + h}`
          : `${x0},${y0 + h} ${x0},${y0} ${x0 + pd},${y0} ${x0 + pd},${y0 + h * 0.2} ${x0 + cell},${y0 + h}`
      body = <polygon points={pts} fill={color} stroke={STROKE} strokeWidth={1.5} />
      break
    }
    case 'cylinder':
      body = <circle cx={ICON / 2} cy={ICON / 2} r={pw / 2} fill={color} stroke={STROKE} strokeWidth={1.5} />
      break
    case 'cone':
      body = (
        <polygon
          points={`${ICON / 2},${oy} ${ICON / 2 + pw / 2},${oy + pd} ${ICON / 2 - pw / 2},${oy + pd}`}
          fill={color}
          stroke={STROKE}
          strokeWidth={1.5}
        />
      )
      break
    default: {
      const studs: ReactNode[] = []
      if (part.studs) {
        for (let i = 0; i < part.w; i++) {
          for (let j = 0; j < part.d; j++) {
            studs.push(
              <circle
                key={`${i}-${j}`}
                cx={ox + (i + 0.5) * cell}
                cy={oy + (j + 0.5) * cell}
                r={cell * 0.3}
                fill="none"
                stroke={STROKE}
                strokeWidth={1}
              />,
            )
          }
        }
      }
      body = (
        <>
          <rect x={ox} y={oy} width={pw} height={pd} rx={2} fill={color} stroke={STROKE} strokeWidth={1.5} />
          {studs}
        </>
      )
    }
  }
  return (
    <svg width={ICON} height={ICON} viewBox={`0 0 ${ICON} ${ICON}`} aria-hidden="true">
      {body}
    </svg>
  )
}

/** Rendered thumbnail of the part in the current colour; the SVG / emoji icon shows until it is ready. */
function PartButtonImage({ part, color, hex }: { part: PartDef; color: number; hex: string }) {
  const fig = useEditor((s) => s.fig)
  if (part.id === MINIFIG_PART) return <FigureImage fig={fig} />
  return <ColoredPartImage part={part} color={color} hex={hex} />
}

function ColoredPartImage({ part, color, hex }: { part: PartDef; color: number; hex: string }) {
  const url = useThumbnail(`part:${part.id}:${color}`, () => getPartThumbnail(part.id, color))
  if (!url) return <PartIcon part={part} color={hex} />
  return <img className="bt-part-thumb" src={url} alt="" draggable={false} />
}

const sizeLabel = (p: PartDef) => `${p.w}×${p.d}`

/** The figure tab: ✏️ (customise the figure to place, shown in its current look), then the ready-made figures. */
function FigureButtons() {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const partId = useEditor((s) => s.partId)
  const fig = useEditor((s) => s.fig)
  const carried = useEditor((s) => s.carried)
  const select = () => {
    const ed = useEditor.getState()
    ed.setPart(MINIFIG_PART)
    ed.setTool('place')
  }
  const current = partId === MINIFIG_PART ? figKey(fig) : null
  return (
    <>
      <button
        className="bt-btn bt-part-btn bt-fig-btn bt-fig-edit-btn"
        data-testid="fig-edit"
        aria-label={t('figEdit')}
        disabled={carried !== null}
        onClick={() => {
          select()
          useEditor.getState().openFigEditor()
        }}
      >
        <FigureImage fig={fig} />
        <span className="bt-fig-edit-badge" aria-hidden="true">✏️</span>
      </button>
      {FIG_PRESETS.map((p) => (
        <button
          key={p.id}
          className="bt-btn bt-part-btn bt-fig-btn"
          data-testid={`fig-preset-${p.id}`}
          aria-label={p.name[lang]}
          aria-pressed={current === figKey(p.style)}
          disabled={carried !== null}
          onClick={() => {
            useEditor.getState().setFig(p.style)
            select()
          }}
        >
          <FigureImage fig={p.style} />
        </button>
      ))}
    </>
  )
}

interface Props {
  /** Show only these parts (no category tabs), e.g. the parts of a Guided Build step. */
  allowedParts?: string[]
}

/** Bottom drawer: category tabs, the current-part rotate button and the parts of that category. */
export default function PartPalette({ allowedParts }: Props = {}) {
  const t = useT()
  const category = useEditor((s) => s.category)
  const partId = useEditor((s) => s.partId)
  const color = useEditor((s) => s.color)
  const rot = useEditor((s) => s.rot)
  const carried = useEditor((s) => s.carried)
  const setCategory = useEditor((s) => s.setCategory)
  const setPart = useEditor((s) => s.setPart)
  const setTool = useEditor((s) => s.setTool)
  const rotateCurrent = useEditor((s) => s.rotateCurrent)
  const hex = COLORS[color]?.hex ?? '#ffffff'
  const current = PARTS.find((p) => p.id === partId)
  const parts = allowedParts
    ? PARTS.filter((p) => allowedParts.includes(p.id))
    : PARTS.filter((p) => p.category === category)

  return (
    <div className="bt-palette bt-hud-panel">
      {!allowedParts && (
        <div className="bt-palette-row" role="tablist">
          {PART_CATEGORIES.map((c) => (
            <button
              key={c}
              role="tab"
              className="bt-btn bt-icon-btn"
              data-testid={`category-${c}`}
              aria-label={t(CATEGORY_TABS[c].labelKey)}
              aria-selected={category === c}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              {CATEGORY_TABS[c].icon}
            </button>
          ))}
        </div>
      )}
      <div className="bt-palette-row bt-palette-parts">
        <button
          className="bt-btn bt-part-btn bt-rotate-btn"
          data-testid="rotate-current"
          aria-label={t('rotatePart')}
          onClick={rotateCurrent}
        >
          <span className="bt-rotate-arrow" aria-hidden="true">↻</span>
          {current && (
            <span className="bt-rotate-preview" style={{ transform: `rotate(${-90 * rot}deg)` }}>
              <PartIcon part={current} color={hex} />
            </span>
          )}
        </button>
        {!allowedParts && category === 'figure' && <FigureButtons />}
        {(allowedParts || category !== 'figure') && parts.map((p) => (
          <button
            key={p.id}
            className="bt-btn bt-part-btn"
            data-testid={`part-${p.id}`}
            aria-label={sizeLabel(p)}
            aria-pressed={partId === p.id}
            disabled={carried !== null}
            onClick={() => {
              setPart(p.id)
              setTool('place')
            }}
          >
            <PartButtonImage part={p} color={color} hex={hex} />
            <span className="bt-part-label">{sizeLabel(p)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
