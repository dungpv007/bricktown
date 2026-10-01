import { useState, type ReactNode } from 'react'
import { ONBOARDED_KEY, readFlag, writeFlag } from './flags'
import { useT, type TKey } from './i18n'

interface Shades {
  top: string
  left: string
  right: string
}

const RED: Shades = { top: '#ff4a52', left: '#e3000b', right: '#a8000a' }
const BLUE: Shades = { top: '#3d8fe8', left: '#0055bf', right: '#003f8f' }
const GREEN: Shades = { top: '#6dc48a', left: '#4ea46b', right: '#2f7f49' }

/** A 2x2 brick in isometric view, centred on (cx, cy) at the top face. */
function IsoBrick({ cx, cy, shades }: { cx: number; cy: number; shades: Shades }) {
  const h = 34
  const studs: Array<[number, number]> = [
    [0, -10],
    [-20, 0],
    [20, 0],
    [0, 10],
  ]
  return (
    <g>
      <polygon points={`${cx - 40},${cy} ${cx},${cy + 20} ${cx},${cy + 20 + h} ${cx - 40},${cy + h}`} fill={shades.left} />
      <polygon points={`${cx + 40},${cy} ${cx},${cy + 20} ${cx},${cy + 20 + h} ${cx + 40},${cy + h}`} fill={shades.right} />
      <polygon points={`${cx},${cy - 20} ${cx + 40},${cy} ${cx},${cy + 20} ${cx - 40},${cy}`} fill={shades.top} />
      {studs.map(([dx, dy]) => (
        <g key={`${dx},${dy}`}>
          <ellipse cx={cx + dx} cy={cy + dy - 1} rx={10} ry={5} fill={shades.left} />
          <rect x={cx + dx - 10} y={cy + dy - 6} width={20} height={5} fill={shades.left} />
          <ellipse cx={cx + dx} cy={cy + dy - 6} rx={10} ry={5} fill={shades.top} />
        </g>
      ))}
    </g>
  )
}

/** The baseplate seen at the same angle as the bricks, with a few studs. */
function Plate() {
  const studs: Array<[number, number]> = []
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) studs.push([120 + (c - r) * 20, 118 + (c + r) * 10])
  return (
    <g>
      <polygon points="120,100 240,160 120,220 0,160" fill={GREEN.right} />
      <polygon points="120,92 236,150 120,208 4,150" fill={GREEN.left} />
      {studs.map(([x, y]) => (
        <ellipse key={`${x},${y}`} cx={x} cy={y + 12} rx={8} ry={4} fill={GREEN.top} />
      ))}
    </g>
  )
}

const Finger = ({ x, y, rotate = 0 }: { x: number; y: number; rotate?: number }) => (
  <text x={x} y={y} fontSize={52} textAnchor="middle" transform={`rotate(${rotate} ${x} ${y})`}>
    👆
  </text>
)

const Arrow = ({ d }: { d: string }) => (
  <path d={d} fill="none" stroke="var(--bt-yellow)" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
)

function TapArt() {
  return (
    <svg viewBox="0 0 240 200" role="img" aria-hidden="true">
      <g transform="translate(0 -30)">
        <Plate />
        <g className="bt-ob-drop">
          <IsoBrick cx={120} cy={104} shades={RED} />
        </g>
        <g className="bt-ob-tap">
          <Finger x={178} y={70} />
        </g>
      </g>
    </svg>
  )
}

function DragArt() {
  return (
    <svg viewBox="0 0 240 200" role="img" aria-hidden="true">
      <g className="bt-ob-turn">
        <IsoBrick cx={120} cy={92} shades={BLUE} />
      </g>
      <Arrow d="M 30 150 Q 120 190 210 150" />
      <path d="M 196 138 L 212 150 L 194 160" fill="none" stroke="var(--bt-yellow)" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 44 138 L 28 150 L 46 160" fill="none" stroke="var(--bt-yellow)" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      <g className="bt-ob-swipe">
        <Finger x={120} y={196} />
      </g>
    </svg>
  )
}

function PinchArt() {
  return (
    <svg viewBox="0 0 240 200" role="img" aria-hidden="true">
      <g className="bt-ob-zoom">
        <IsoBrick cx={120} cy={92} shades={GREEN} />
      </g>
      <g className="bt-ob-pinch-a">
        <Arrow d="M 96 128 L 52 172 M 52 172 L 52 150 M 52 172 L 74 172" />
        <Finger x={104} y={146} rotate={-35} />
      </g>
      <g className="bt-ob-pinch-b">
        <Arrow d="M 146 64 L 188 22 M 188 22 L 188 44 M 188 22 L 166 22" />
        <Finger x={138} y={86} rotate={145} />
      </g>
    </svg>
  )
}

const CARDS: Array<{ labelKey: TKey; art: ReactNode }> = [
  { labelKey: 'onboardTap', art: <TapArt /> },
  { labelKey: 'onboardDrag', art: <DragArt /> },
  { labelKey: 'onboardPinch', art: <PinchArt /> },
]

/** Set once the tour is closed, so blocked storage does not bring it back on every menu visit. */
let closedThisSession = false

/** First-launch picture tour: tap to place, drag to look around, pinch to zoom. Skippable. */
export default function Onboarding() {
  const t = useT()
  const [open, setOpen] = useState(() => !closedThisSession && !readFlag(ONBOARDED_KEY))
  const [index, setIndex] = useState(0)
  if (!open) return null

  const finish = () => {
    closedThisSession = true
    writeFlag(ONBOARDED_KEY)
    setOpen(false)
  }
  const last = index === CARDS.length - 1
  const card = CARDS[index]

  return (
    <div className="bt-onboarding" data-testid="onboarding" role="dialog" aria-modal="true" aria-label={t(card.labelKey)}>
      <div className="bt-onboarding-card" data-testid={`onboarding-card-${index}`}>
        <div className="bt-onboarding-art">{card.art}</div>
        <p className="bt-onboarding-text">{t(card.labelKey)}</p>
        <div className="bt-onboarding-dots" aria-hidden="true">
          {CARDS.map((_, i) => (
            <span key={i} className={i === index ? 'bt-ob-dot bt-ob-dot-on' : 'bt-ob-dot'} />
          ))}
        </div>
        <div className="bt-row">
          <button className="bt-btn" data-testid="onboarding-skip" aria-label={t('onboardSkip')} onClick={finish}>
            ✕
          </button>
          {last ? (
            <button className="bt-btn bt-yes" data-testid="onboarding-done" aria-label={t('onboardStart')} onClick={finish}>
              ✓
            </button>
          ) : (
            <button
              className="bt-btn bt-yes"
              data-testid="onboarding-next"
              aria-label={t('onboardNext')}
              onClick={() => setIndex(index + 1)}
            >
              ▶
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
