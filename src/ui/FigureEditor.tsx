import { useEffect, useState, type CSSProperties } from 'react'
import { COLORS } from '../core/colors'
import {
  DEFAULT_HAT_COLOR, FIG_ACCESSORIES, FIG_FACES, FIG_HATS, FIG_PRESETS, FIG_PRINTS, canonicalFig, figKey, figOf, isFigColor, isFigure,
} from '../core/figures'
import type { FigAccessory, FigFace, FigHat, FigPrint, FigStyle } from '../core/types'
import { getFigureThumbnail } from '../render/thumbnails'
import { useApp } from '../state/useApp'
import { useEditor } from '../state/useEditor'
import { useGame } from '../state/useGame'
import { useT, type TKey } from './i18n'
import { useThumbnail } from './useThumbnail'

/** Solid and metallic colours (see `isFigColor`): a gold crown shows as picked. */
const FIG_COLORS = COLORS.filter((c) => isFigColor(c.id))

const HAT_ICON: Record<FigHat, string> = {
  none: '⭕', hair_short: '💇', hair_long: '👩', hair_ponytail: '👧', cap: '🧢', police: '👮', chef: '👨‍🍳',
  fire: '⛑️', construction: '👷', space: '🧑‍🚀', crown: '👑', robber_cap: '🥷',
}
const FACE_ICON: Record<FigFace, string> = { smile: '🙂', grin: '😁', wink: '😉', surprised: '😮', beard: '🧔', glasses: '🤓' }
const PRINT_ICON: Record<FigPrint, string> = {
  plain: '👕', police: '🚓', chef: '🍳', fire: '🔥', space: '🚀', vest: '🦺', stripes: '🦓', suit: '👔', apron: '🍽️',
}
const ACCESSORY_ICON: Record<FigAccessory, string> = { none: '✋', tool: '🔧', pan: '🍳', radio: '📻', flashlight: '🔦' }

type Tab = 'presets' | 'torso' | 'legs' | 'hat' | 'face' | 'accessory'
const TABS: Array<{ tab: Tab; icon: string; labelKey: TKey }> = [
  { tab: 'presets', icon: '⭐', labelKey: 'figTabPresets' },
  { tab: 'torso', icon: '👕', labelKey: 'figTabTorso' },
  { tab: 'legs', icon: '👖', labelKey: 'figTabLegs' },
  { tab: 'hat', icon: '🎩', labelKey: 'figTabHat' },
  { tab: 'face', icon: '🙂', labelKey: 'figTabFace' },
  { tab: 'accessory', icon: '🔧', labelKey: 'figTabAccessory' },
]

const PREVIEW_SIZE = 256

/** A figure picture (thumbnail render), with an emoji while it renders or without WebGL. */
export function FigureImage({ fig, size, className }: { fig: FigStyle; size?: number; className?: string }) {
  const key = `${figKey(fig)}:${size ?? 'part'}`
  const url = useThumbnail(key, () => getFigureThumbnail(fig, size))
  if (!url) return <span className="bt-part-emoji" aria-hidden="true">🧑</span>
  return <img className={className ?? 'bt-part-thumb'} src={url} alt="" draggable={false} />
}

function Swatches({ testId, current, onPick }: { testId: string; current: number; onPick: (c: number) => void }) {
  const lang = useApp((s) => s.lang)
  return (
    <div className="bt-fig-options" role="group">
      {FIG_COLORS.map((c) => (
        <button
          key={c.id}
          className="bt-swatch bt-fig-swatch"
          style={{ '--bt-swatch-color': c.hex } as CSSProperties}
          data-testid={`${testId}-${c.id}`}
          aria-label={c.name[lang]}
          aria-pressed={current === c.id}
          onClick={() => onPick(c.id)}
        />
      ))}
    </div>
  )
}

function Options<T extends string>({
  testId, options, icons, labelPrefix, current, onPick,
}: {
  testId: string
  options: readonly T[]
  icons: Record<T, string>
  labelPrefix: string
  current: T
  onPick: (v: T) => void
}) {
  const t = useT()
  return (
    <div className="bt-fig-options" role="group">
      {options.map((o) => (
        <button
          key={o}
          className="bt-btn bt-icon-btn bt-fig-option"
          data-testid={`${testId}-${o}`}
          aria-label={t(`${labelPrefix}${o}` as TKey)}
          aria-pressed={current === o}
          onClick={() => onPick(o)}
        >
          {icons[o]}
        </button>
      ))}
    </div>
  )
}

/**
 * Customise a minifigure: a live preview and one tab per part (ready-made figures, shirt colour and
 * print, trousers, hat or hair and its colour, face, held item). Edits either the figure about to
 * be placed or a placed one (each change of a placed figure is one undo step). Opened from the
 * palette's ✏️ button or by tapping a figure with the paint tool.
 */
export default function FigureEditor() {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const target = useEditor((s) => s.figEditor)
  const currentFig = useEditor((s) => s.fig)
  const close = useEditor((s) => s.closeFigEditor)
  const brickId = target?.brickId ?? null
  const placed = useGame((s) => (brickId === null ? undefined : s.data.workshop.bricks.find((b) => b.id === brickId)))
  const [tab, setTab] = useState<Tab>('presets')
  const gone = brickId !== null && (!placed || !isFigure(placed))

  // The figure went away under the editor (e.g. undo of its placement): nothing left to edit.
  useEffect(() => {
    if (target && gone) close()
  }, [target, gone, close])

  if (!target || gone) return null
  const style: FigStyle = placed ? figOf(placed) : currentFig
  const look = canonicalFig(style)
  const apply = (next: FigStyle) => {
    const ed = useEditor.getState()
    if (brickId === null) ed.setFig(next)
    else ed.restyleFigure(brickId, next)
  }
  const update = (patch: Partial<FigStyle>) => apply({ ...style, ...patch })

  return (
    <div className="bt-modal-backdrop" onClick={close}>
      <div className="bt-fig-editor" role="dialog" aria-label={t('figEdit')} data-testid="fig-editor" onClick={(e) => e.stopPropagation()}>
        <div className="bt-fig-preview" data-testid="fig-preview" data-fig={figKey(style)}>
          <FigureImage fig={style} size={PREVIEW_SIZE} className="bt-fig-preview-img" />
        </div>
        <div className="bt-fig-panel">
          <div className="bt-fig-tabs" role="tablist">
            {TABS.map((x) => (
              <button
                key={x.tab}
                role="tab"
                className="bt-btn bt-icon-btn"
                data-testid={`fig-tab-${x.tab}`}
                aria-label={t(x.labelKey)}
                aria-selected={tab === x.tab}
                aria-pressed={tab === x.tab}
                onClick={() => setTab(x.tab)}
              >
                {x.icon}
              </button>
            ))}
          </div>
          <div className="bt-fig-tab-body">
            {tab === 'presets' && (
              <div className="bt-fig-options" role="group">
                {FIG_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    className="bt-btn bt-part-btn bt-fig-preset"
                    data-testid={`fig-editor-preset-${p.id}`}
                    aria-label={p.name[lang]}
                    aria-pressed={figKey(p.style) === figKey(style)}
                    onClick={() => apply(p.style)}
                  >
                    <FigureImage fig={p.style} />
                  </button>
                ))}
              </div>
            )}
            {tab === 'torso' && (
              <>
                <Swatches testId="fig-torso" current={look.torso} onPick={(c) => update({ torso: c })} />
                <Options testId="fig-print" options={FIG_PRINTS} icons={PRINT_ICON} labelPrefix="figPrint_" current={look.print} onPick={(print) => update({ print })} />
              </>
            )}
            {tab === 'legs' && <Swatches testId="fig-legs" current={look.legs} onPick={(c) => update({ legs: c })} />}
            {tab === 'hat' && (
              <>
                <Options
                  testId="fig-hat"
                  options={FIG_HATS}
                  icons={HAT_ICON}
                  labelPrefix="figHat_"
                  current={look.hat}
                  // A new hat comes in its own colour (a crown in gold, a chef hat in white).
                  onPick={(hat) => update({ hat, hatColor: DEFAULT_HAT_COLOR[hat] })}
                />
                {look.hat !== 'none' && (
                  <div aria-label={t('figHatColor')} role="group">
                    <Swatches testId="fig-hatcolor" current={look.hatColor} onPick={(c) => update({ hatColor: c })} />
                  </div>
                )}
              </>
            )}
            {tab === 'face' && <Options testId="fig-face" options={FIG_FACES} icons={FACE_ICON} labelPrefix="figFace_" current={look.face} onPick={(face) => update({ face })} />}
            {tab === 'accessory' && (
              <Options testId="fig-acc" options={FIG_ACCESSORIES} icons={ACCESSORY_ICON} labelPrefix="figAcc_" current={look.accessory} onPick={(accessory) => update({ accessory })} />
            )}
          </div>
        </div>
        <button className="bt-btn bt-yes bt-fig-done" data-testid="fig-editor-done" aria-label={t('done')} onClick={close}>
          ✓
        </button>
      </div>
    </div>
  )
}
