import { useMemo } from 'react'
import { TEMPLATES } from '../../content/templates'
import { analyzeDrive } from '../../core/drive'
import type { Brick } from '../../core/types'
import { getThumbnail } from '../../render/thumbnails'
import { templateSource } from '../../render/sources'
import { useApp } from '../../state/useApp'
import { useGame } from '../../state/useGame'
import { KIND_ICON } from '../../ui/blueprintKinds'
import { useT } from '../../ui/i18n'
import { useThumbnail } from '../../ui/useThumbnail'

const CARD_COLORS = ['var(--bt-orange)', 'var(--bt-blue)', 'var(--bt-red)', 'var(--bt-green)']

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
  const drivable = useMemo(() => analyzeDrive(entry.bricks).ok, [entry.bricks])
  return (
    <button
      className="bt-card bt-veh-card"
      style={{ background: drivable ? color : undefined }}
      data-testid={`veh-${entry.source}`}
      aria-label={drivable ? entry.name : `${entry.name}: ${t('driveNeedsWheels')}`}
      disabled={!drivable}
      onClick={() => onPick(entry.source)}
    >
      {!drivable && (
        <span className="bt-veh-hint" data-testid="veh-needs-wheels" title={t('driveNeedsWheels')} aria-hidden="true">
          🛞
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
 * Builds that cannot drive (no wheels, or one axle) are shown greyed out with a wheel hint.
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
