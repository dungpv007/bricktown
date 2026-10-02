import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { COLORS } from '../core/colors'
import { FIG_PRESETS, MINIFIG_PART, figKey } from '../core/figures'
import { PART_BY_ID, PART_CATEGORIES, PARTS } from '../core/parts/catalog'
import type { PartCategory, PartDef, PartShape } from '../core/types'
import { POP_MS, RETURN_MS, avatarOffset, reducedMotion } from '../input/dragLift'
import { usePaletteDrag } from '../input/paletteDrag'
import { useApp } from '../state/useApp'
import { useEditor } from '../state/useEditor'
import { usePaletteLift, type LiftItem } from '../state/usePaletteLift'
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
  sushi: '🍣', bakery: '🥐', toys: '🧸', grocery: '🍎', taxi: '🚕', fish: '🐟',
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

type PaletteButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onPointerDown'> & {
  /** Makes this button's part the current one (when a drag begins, and on a tap unless `toggle` is given). */
  select: () => void
  /** A tap instead of `select`: e.g. clears the selection when this part is already the current one. */
  toggle?: () => void
  /** The part can be dragged out onto the 3D view (Workshop). */
  dragToPlace: boolean
  /** What a drag lifts out of this button (the floating copy under the finger). */
  lift: () => LiftItem
  'data-testid': string
}

/** The chip's pop when a drag lifts its part out (none with reduced motion). */
function popChip(el: HTMLElement) {
  if (reducedMotion() || typeof el.animate !== 'function') return
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.2)', offset: 0.4 }, { transform: 'scale(1)' }], {
    duration: POP_MS,
    easing: 'ease-out',
  })
}

/** A palette button that selects its part on a tap and, when `dragToPlace`, can be dragged onto the view. */
function PaletteButton({ select, toggle, dragToPlace, lift, className, ...rest }: PaletteButtonProps) {
  // A drag is not a tap: the click that may follow its release must not toggle the part off again.
  const dragged = useRef(false)
  const button = useRef<HTMLButtonElement>(null)
  const testId = rest['data-testid']
  const startDrag = usePaletteDrag(({ touch }) => {
    dragged.current = true
    select()
    if (button.current) popChip(button.current)
    usePaletteLift.getState().begin({ item: lift(), source: testId, touch })
  })
  return (
    <button
      {...rest}
      ref={button}
      className={dragToPlace ? `${className} bt-part-drag` : className}
      onPointerDown={
        dragToPlace
          ? (e) => {
              dragged.current = false
              startDrag(e)
            }
          : undefined
      }
      onClick={() => {
        if (dragged.current) {
          dragged.current = false
          return
        }
        ;(toggle ?? select)()
      }}
    />
  )
}

/** The lifted part's picture: the part in the colour it was dragged in, or the figure. */
function LiftImage({ item }: { item: LiftItem }) {
  if (item.kind === 'fig') return <FigureImage fig={item.fig} />
  const part = PART_BY_ID[item.partId]
  if (!part) return null
  return <ColoredPartImage part={part} color={item.color} hex={COLORS[item.color]?.hex ?? '#ffffff'} />
}

const translate = (x: number, y: number) => `translate3d(${x}px, ${y}px, 0)`

/**
 * The part lifted out of the palette: it follows the finger (a little above it, with a shadow),
 * shrinks and fades into the 3D ghost while over the view, shows again over the HUD, and flies back
 * to its chip when the drop placed nothing. Moved straight from the lift store (transform only, no
 * re-render per pointer move); hidden while no drag is on.
 */
function LiftAvatar() {
  const drag = usePaletteLift((s) => s.drag)
  const hasPointer = usePaletteLift((s) => s.pointer !== null)
  const inScene = usePaletteLift((s) => s.inScene)
  const last = usePaletteLift((s) => s.last)
  // The last fly-back that finished (by drag number).
  const [returned, setReturned] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const offset = useRef({ dx: 0, dy: 0 })

  useEffect(
    () =>
      usePaletteLift.subscribe((s, prev) => {
        const el = ref.current
        if (!el || !s.drag) return
        if (s.drag !== prev.drag) {
          const size = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0
          offset.current = avatarOffset(size, s.drag.touch)
        }
        if (s.pointer) el.style.transform = translate(s.pointer.x + offset.current.dx, s.pointer.y + offset.current.dy)
      }),
    [],
  )

  useEffect(() => {
    const el = ref.current
    if (!el || !last || last.outcome === 'placed' || !last.at) return
    const size = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0
    const { dx, dy } = offset.current
    const chip = document.querySelector(`[data-testid="${last.drag.source}"]`)?.getBoundingClientRect()
    const to = chip
      ? { x: chip.left + chip.width / 2 - size / 2, y: chip.top + chip.height / 2 - size / 2 }
      : { x: last.at.x + dx, y: last.at.y + dy }
    const seq = last.seq
    if (typeof el.animate !== 'function') {
      const timer = setTimeout(() => setReturned(seq), 0)
      return () => clearTimeout(timer)
    }
    const fly = el.animate(
      [
        { transform: `${translate(last.at.x + dx, last.at.y + dy)} scale(1)`, opacity: 1 },
        { transform: `${translate(to.x, to.y)} scale(0.5)`, opacity: 0 },
      ],
      { duration: reducedMotion() ? 0 : RETURN_MS, easing: 'ease-in' },
    )
    fly.onfinish = () => setReturned(seq)
    return () => fly.cancel()
  }, [last])

  const flying = drag === null && last !== null && last.outcome !== 'placed' && last.at !== null && last.seq !== returned
  const state = drag && hasPointer ? (inScene ? 'in-scene' : 'lifted') : flying ? 'returning' : 'idle'
  const item = drag?.item ?? last?.drag.item
  return createPortal(
    <div
      ref={ref}
      className="bt-drag-avatar bt-lift"
      data-testid="drag-avatar"
      data-state={state}
      data-shown={state !== 'idle'}
      aria-hidden="true"
    >
      <div className="bt-drag-avatar-inner">{item && <LiftImage item={item} />}</div>
    </div>,
    document.body,
  )
}

/** The figure tab: ✏️ (customise the figure to place, shown in its current look), then the ready-made figures. */
function FigureButtons({ dragToPlace }: { dragToPlace: boolean }) {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const partId = useEditor((s) => s.partId)
  const fig = useEditor((s) => s.fig)
  const select = () => useEditor.getState().setPart(MINIFIG_PART)
  const current = partId === MINIFIG_PART ? figKey(fig) : null
  return (
    <>
      <button
        className="bt-btn bt-part-btn bt-fig-btn bt-fig-edit-btn"
        data-testid="fig-edit"
        aria-label={t('figEdit')}
        onClick={() => {
          select()
          useEditor.getState().openFigEditor()
        }}
      >
        <FigureImage fig={fig} />
        <span className="bt-fig-edit-badge" aria-hidden="true">✏️</span>
      </button>
      {FIG_PRESETS.map((p) => (
        <PaletteButton
          key={p.id}
          className="bt-btn bt-part-btn bt-fig-btn"
          data-testid={`fig-preset-${p.id}`}
          aria-label={p.name[lang]}
          aria-pressed={current === figKey(p.style)}
          dragToPlace={dragToPlace}
          lift={() => ({ kind: 'fig', fig: p.style })}
          select={() => {
            useEditor.getState().setFig(p.style)
            select()
          }}
          toggle={() => {
            const ed = useEditor.getState()
            if (current === figKey(p.style)) return ed.setPart(null)
            ed.setFig(p.style)
            select()
          }}
        >
          <FigureImage fig={p.style} />
        </PaletteButton>
      ))}
    </>
  )
}

interface Props {
  /** Show only these parts (no category tabs), e.g. the parts of a Guided Build step. */
  allowedParts?: string[]
  /** Parts can be dragged out onto the 3D view to place them (Workshop). */
  dragToPlace?: boolean
}

/** Bottom drawer: category tabs, the current-part rotate button and the parts of that category. */
export default function PartPalette({ allowedParts, dragToPlace = false }: Props = {}) {
  const t = useT()
  const category = useEditor((s) => s.category)
  const partId = useEditor((s) => s.partId)
  const color = useEditor((s) => s.color)
  const rot = useEditor((s) => s.rot)
  const setCategory = useEditor((s) => s.setCategory)
  const setPart = useEditor((s) => s.setPart)
  const togglePart = useEditor((s) => s.togglePart)
  const rotateCurrent = useEditor((s) => s.rotateCurrent)
  const hex = COLORS[color]?.hex ?? '#ffffff'
  const current = partId === null ? undefined : PARTS.find((p) => p.id === partId)
  const parts = allowedParts
    ? PARTS.filter((p) => allowedParts.includes(p.id))
    : PARTS.filter((p) => p.category === category)

  return (
    <>
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
          {!allowedParts && category === 'figure' && <FigureButtons dragToPlace={dragToPlace} />}
          {(allowedParts || category !== 'figure') && parts.map((p) => (
            <PaletteButton
              key={p.id}
              className="bt-btn bt-part-btn"
              data-testid={`part-${p.id}`}
              aria-label={sizeLabel(p)}
              aria-pressed={partId === p.id}
              dragToPlace={dragToPlace}
              lift={() => ({ kind: 'part', partId: p.id, color: useEditor.getState().color })}
              select={() => setPart(p.id)}
              toggle={() => togglePart(p.id)}
            >
              <PartButtonImage part={p} color={color} hex={hex} />
              <span className="bt-part-label">{sizeLabel(p)}</span>
            </PaletteButton>
          ))}
        </div>
      </div>
      {dragToPlace && <LiftAvatar />}
    </>
  )
}
