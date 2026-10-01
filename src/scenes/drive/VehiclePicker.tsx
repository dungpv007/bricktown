import { useMemo } from 'react'
import { TEMPLATES } from '../../content/templates'
import { analyzeDrive, type DriveProblem } from '../../core/drive'
import type { Brick } from '../../core/types'
import { getThumbnail } from '../../render/thumbnails'
import { templateSource } from '../../render/sources'
import { useApp } from '../../state/useApp'
import { useGame } from '../../state/useGame'
import { KIND_ICON } from '../../ui/blueprintKinds'
import { useT, type TKey } from '../../ui/i18n'
import { useThumbnail } from '../../ui/useThumbnail'

const CARD_COLORS = ['var(--bt-orange)', 'var(--bt-blue)', 'var(--bt-red)', 'var(--bt-green)']

/** The badge on a greyed-out card: what to fix, as an icon (the words are for screen readers). */
const HINTS: Record<DriveProblem, { icon: string; key: TKey; testId: string }> = {
  no_wheels: { icon: '🛞', key: 'driveNeedsWheels', testId: 'veh-needs-wheels' },
  one_axle: { icon: '🛞', key: 'driveNeedsWheels', testId: 'veh-needs-wheels' },
  wheels_sideways: { icon: '🛞🔄', key: 'driveTurnWheels', testId: 'veh-turn-wheels' },
  wheels_not_lowest: { icon: '🛞⬇️', key: 'driveWheelsLow', testId: 'veh-wheels-low' },
  unknown_part: { icon: '❓', key: 'driveUnknownPart', testId: 'veh-unknown-part' },
}

interface Entry {
  source: string
  /** Thumbnail cache key, shared with the other pickers. */
  thumbKey: string
  name: string
  bricks: Brick[]
}

function VehicleCard({ entry, color, onPick }: { entry: Entry; color: string; onPick: (source: string) => void }) {
  const t = useT()
  const url = useThumbnail(entry.thumbKey, () => getThumbnail(entry.thumbKey, entry.bricks))
  const analysis = useMemo(() => analyzeDrive(entry.bricks), [entry.bricks])
  const hint = analysis.ok ? null : HINTS[analysis.reason]
  return (
    <button
      className="bt-card bt-veh-card"
      style={{ background: hint ? undefined : color }}
      data-testid={`veh-${entry.source}`}
      aria-label={hint ? `${entry.name}: ${t(hint.key)}` : entry.name}
      disabled={hint !== null}
      onClick={() => onPick(entry.source)}
    >
      {hint && (
        <span className="bt-veh-hint" data-testid={hint.testId} title={t(hint.key)} aria-hidden="true">
          {hint.icon}
        </span>
      )}
      {url ? (
        <img className="bt-tpl-thumb" src={url} alt="" draggable={false} />
      ) : (
        <span className="bt-card-icon" aria-hidden="true">{KIND_ICON.vehicle}</span>
      )}
      <span className="bt-veh-name">{entry.name}</span>
    </button>
  )
}

/**
 * Pick what to drive: the ready-made vehicles first, then the kid's own vehicle blueprints.
 * Builds that cannot drive are shown greyed out with a hint badge saying what to fix.
 */
export default function VehiclePicker({ onPick }: { onPick: (source: string) => void }) {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const blueprints = useGame((s) => s.data.blueprints)

  const entries = useMemo<Entry[]>(() => {
    const templates = TEMPLATES.filter((tpl) => tpl.kind === 'vehicle').map((tpl) => ({
      source: templateSource(tpl.id),
      thumbKey: `tpl:${tpl.id}`,
      name: tpl.name[lang],
      bricks: tpl.bricks,
    }))
    const own = blueprints
      .filter((bp) => bp.kind === 'vehicle')
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((bp) => ({ source: bp.id, thumbKey: `bp:${bp.id}:${bp.updatedAt}`, name: bp.name, bricks: bp.bricks }))
    return [...templates, ...own]
  }, [blueprints, lang])

  return (
    <div className="bt-veh-picker" data-testid="vehicle-picker">
      <h2 className="bt-picker-title">{t('drivePick')}</h2>
      <div className="bt-cards">
        {entries.map((entry, i) => (
          <VehicleCard key={entry.source} entry={entry} color={CARD_COLORS[i % CARD_COLORS.length]} onPick={onPick} />
        ))}
      </div>
    </div>
  )
}
