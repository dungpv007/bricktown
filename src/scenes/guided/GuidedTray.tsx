import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { COLORS } from '../../core/colors'
import { trayCards, type TrayCard } from '../../core/guidedTray'
import { PART_BY_ID } from '../../core/parts/catalog'
import type { Brick, GuidedState, Template } from '../../core/types'
import { usePaletteDrag } from '../../input/paletteDrag'
import { getPartThumbnail } from '../../render/thumbnails'
import { useApp } from '../../state/useApp'
import { useGuided } from '../../state/useGuided'
import { useGuidedDrag } from '../../state/useGuidedDrag'
import { FigureImage } from '../../ui/FigureEditor'
import { useT } from '../../ui/i18n'
import { PartIcon } from '../../ui/PartPalette'
import { useThumbnail } from '../../ui/useThumbnail'

const RETURN_MS = 260
const SHAKE_MS = 400

/** Bricks the viewed step asks for: what is still missing now, or everything of an earlier step. */
function viewedBricks(t: Template, g: GuidedState, viewStep: number): Brick[] {
  const bricks = (t.steps[viewStep] ?? []).map((i) => t.bricks[i])
  return viewStep < g.step ? bricks : bricks.filter((b) => !g.placed.includes(b.id))
}

const cardSelector = (key: string) => `[data-card-key="${CSS.escape(key)}"]`
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** The piece in its colour (a figure in its look): a rendered thumbnail, the icon until it is ready. */
function PieceImage({ card }: { card: TrayCard }) {
  if (card.fig) return <FigureImage fig={card.fig} />
  return <PartImage p={card.p} c={card.c} />
}

function PartImage({ p, c }: { p: string; c: number }) {
  const url = useThumbnail(`part:${p}:${c}`, () => getPartThumbnail(p, c))
  const part = PART_BY_ID[p]
  if (!url) return part ? <PartIcon part={part} color={COLORS[c]?.hex ?? '#ffffff'} /> : null
  return <img className="bt-part-thumb" src={url} alt="" draggable={false} />
}

/** The piece image, turned like the card (normal mode). */
function TurnedPiece({ card, rot }: { card: TrayCard; rot: number }) {
  return (
    <span className="bt-tray-piece" style={rot ? { transform: `rotate(${-90 * rot}deg)` } : undefined}>
      <PieceImage card={card} />
    </span>
  )
}

/** A card of the current step: tap selects it (for ↻), drag puts the piece on the model. */
function CardButton({ card, index }: { card: TrayCard; index: number }) {
  const t = useT()
  const easy = useApp((s) => s.difficulty === 'easy')
  const rot = useGuided((s) => s.cardRots[card.key] ?? 0)
  const selected = useGuided((s) => s.selectedCard === card.key)
  const dragging = useGuidedDrag((s) => s.card?.key === card.key)
  const select = () => useGuided.getState().selectCard(card.key)
  const startDrag = usePaletteDrag(
    () => {
      select()
      useGuidedDrag.getState().begin({ ...card, r: useGuided.getState().cardRot(card.key) })
    },
    { cancelOnSecondPointer: true },
  )
  const count = card.bricks.length
  return (
    <button
      className="bt-btn bt-tray-card"
      data-testid={`needed-${card.key}`}
      data-card-key={card.key}
      data-card-index={index}
      data-dragging={dragging}
      aria-label={`${t('dragPiece')} (${count})`}
      aria-pressed={!easy && selected}
      onPointerDown={startDrag}
      onClick={select}
    >
      <TurnedPiece card={card} rot={easy ? 0 : rot} />
      {count > 1 && <span className="bt-tray-count">{`×${count}`}</span>}
    </button>
  )
}

/** ↻ (normal mode): turns the selected card a quarter turn; shows that card turned. */
function RotateButton({ cards }: { cards: TrayCard[] }) {
  const t = useT()
  const selectedKey = useGuided((s) => s.selectedCard)
  const card = cards.find((c) => c.key === selectedKey) ?? cards[0]
  const rot = useGuided((s) => (card ? (s.cardRots[card.key] ?? 0) : 0))
  if (!card) return null
  return (
    <button
      className="bt-btn bt-tray-card bt-tray-rotate"
      data-testid="guided-rotate"
      aria-label={t('rotatePart')}
      onClick={() => useGuided.getState().rotateCard()}
    >
      <span className="bt-rotate-arrow" aria-hidden="true">↻</span>
      <TurnedPiece card={card} rot={rot} />
    </button>
  )
}

/**
 * The piece following the finger while it is not shown in the view, and flying back to its card
 * when a drop did not place it (the card then shakes, unless the drag was cancelled). Driven straight
 * from the drag store (no re-render per finger move).
 */
function DragAvatar() {
  const card = useGuidedDrag((s) => s.card)
  const last = useGuidedDrag((s) => s.last)
  const shown = useGuidedDrag((s) => s.card !== null && s.pointer !== null && !s.inScene)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(
    () =>
      useGuidedDrag.subscribe((s) => {
        if (ref.current && s.pointer) ref.current.style.transform = `translate(${s.pointer.x}px, ${s.pointer.y}px)`
      }),
    [],
  )

  useEffect(() => {
    const el = ref.current
    if (!el || !last || last.outcome === 'placed' || !last.at) return
    const cardEl = document.querySelector(cardSelector(last.card.key))
    if (!cardEl) return
    const r = cardEl.getBoundingClientRect()
    const fast = reducedMotion()
    const fly = el.animate(
      [
        { transform: `translate(${last.at.x}px, ${last.at.y}px) scale(1)`, opacity: 1 },
        { transform: `translate(${r.left + r.width / 2}px, ${r.top + r.height / 2}px) scale(0.6)`, opacity: 0.3 },
      ],
      { duration: fast ? 0 : RETURN_MS, easing: 'ease-in' },
    )
    let shake: Animation | null = null
    fly.onfinish = () => {
      if (last.outcome === 'cancelled') return
      shake = cardEl.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(0)' }],
        { duration: fast ? 0 : SHAKE_MS },
      )
    }
    return () => {
      fly.cancel()
      shake?.cancel()
    }
  }, [last])

  const piece = card ?? last?.card
  return (
    <div ref={ref} className="bt-drag-avatar" data-testid="drag-avatar" data-shown={shown} aria-hidden="true">
      <div className="bt-drag-avatar-inner">{piece && <PieceImage card={piece} />}</div>
    </div>
  )
}

/** "Drag me": a hand sliding from the first card to its spot on the model (first step, until the first drop). */
function DragHint() {
  const to = useGuidedDrag((s) => s.hintTo)
  const dragging = useGuidedDrag((s) => s.card !== null)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const cardEl = document.querySelector('[data-card-index="0"]')
    if (!el || !cardEl || !to) return
    const r = cardEl.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.style.setProperty('--bt-hint-dx', `${to.x - x}px`)
    el.style.setProperty('--bt-hint-dy', `${to.y - y}px`)
  }, [to])
  if (!to || dragging) return null
  return (
    <div ref={ref} className="bt-drag-hint" data-testid="drag-hint" aria-hidden="true">
      👆
    </div>
  )
}

/**
 * The piece tray at the bottom: the viewed step's still-needed pieces as big cards (×count when
 * several). Cards of the current step are dragged onto the model; an earlier step's are read-only.
 */
export default function GuidedTray({ template, guided }: { template: Template; guided: GuidedState }) {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const easy = useApp((s) => s.difficulty === 'easy')
  const viewStep = useGuided((s) => s.viewStep)
  const viewingPast = viewStep < guided.step
  const cards = useMemo(() => trayCards(viewedBricks(template, guided, viewStep)), [template, guided, viewStep])
  return (
    <>
      <div className="bt-tray bt-hud-panel" data-testid="needed" role="group" aria-label={t('needed')} data-readonly={viewingPast}>
        <div className="bt-tray-title">{template.name[lang]}</div>
        <div className="bt-tray-cards">
          {cards.map((card, i) =>
            viewingPast ? (
              <div key={card.key} className="bt-btn bt-tray-card" data-testid={`needed-${card.key}`} aria-disabled="true">
                <TurnedPiece card={card} rot={0} />
                {card.bricks.length > 1 && <span className="bt-tray-count">{`×${card.bricks.length}`}</span>}
              </div>
            ) : (
              <CardButton key={card.key} card={card} index={i} />
            ),
          )}
        </div>
        {!easy && !viewingPast && <RotateButton cards={cards} />}
      </div>
      {!viewingPast && <DragHint />}
      <DragAvatar />
    </>
  )
}
