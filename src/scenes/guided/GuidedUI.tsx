import { useState } from 'react'
import { getTemplate } from '../../content/templates'
import { COLORS } from '../../core/colors'
import { PART_BY_ID } from '../../core/parts/catalog'
import type { Brick, GuidedState, Template } from '../../core/types'
import { useApp } from '../../state/useApp'
import { useEditor, workshopHasBricks } from '../../state/useEditor'
import { useGame } from '../../state/useGame'
import { useGuided } from '../../state/useGuided'
import ColorPicker from '../../ui/ColorPicker'
import ConfirmDialog from '../../ui/ConfirmDialog'
import Confetti from '../../ui/Confetti'
import { useT } from '../../ui/i18n'
import PartPalette, { PartIcon } from '../../ui/PartPalette'

/** Bricks the viewed step asks for: what is still missing now, or everything of an earlier step. */
function viewedBricks(t: Template, g: GuidedState, viewStep: number): Brick[] {
  const bricks = (t.steps[viewStep] ?? []).map((i) => t.bricks[i])
  return viewStep < g.step ? bricks : bricks.filter((b) => !g.placed.includes(b.id))
}

/** Groups bricks by part and colour: "2 × red 2×4". */
function groupNeeded(bricks: Brick[]): Array<{ p: string; c: number; count: number }> {
  const groups = new Map<string, { p: string; c: number; count: number }>()
  for (const b of bricks) {
    const key = `${b.p}|${b.c}`
    const g = groups.get(key)
    if (g) g.count++
    else groups.set(key, { p: b.p, c: b.c, count: 1 })
  }
  return [...groups.values()]
}

function StepNav({ total }: { total: number }) {
  const t = useT()
  const viewStep = useGuided((s) => s.viewStep)
  const step = useGame((s) => s.data.guided?.step ?? 0)
  const prevStep = useGuided((s) => s.prevStep)
  const nextStep = useGuided((s) => s.nextStep)
  return (
    <div className="bt-stepnav">
      <button
        className="bt-btn bt-icon-btn"
        data-testid="step-prev"
        aria-label={t('stepPrev')}
        disabled={viewStep === 0}
        onClick={prevStep}
      >
        ◀
      </button>
      <span className="bt-step-counter" data-testid="step-counter" aria-label={t('stepCounter')}>
        {`${viewStep + 1}/${total}`}
      </span>
      <button
        className="bt-btn bt-icon-btn"
        data-testid="step-next"
        aria-label={t('stepNext')}
        disabled={viewStep >= step}
        onClick={nextStep}
      >
        ▶
      </button>
    </div>
  )
}

function NeededPanel({ template, guided }: { template: Template; guided: GuidedState }) {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const viewStep = useGuided((s) => s.viewStep)
  const needed = groupNeeded(viewedBricks(template, guided, viewStep))
  return (
    <div className="bt-needed" data-testid="needed" role="list" aria-label={t('needed')}>
      <div className="bt-needed-title">{template.name[lang]}</div>
      {needed.map(({ p, c, count }) => {
        const part = PART_BY_ID[p]
        return (
          <div key={`${p}|${c}`} className="bt-needed-item" role="listitem" data-testid={`needed-${p}-${c}`}>
            <span className="bt-needed-count">{`${count}×`}</span>
            {part && <PartIcon part={part} color={COLORS[c]?.hex ?? '#ffffff'} />}
          </div>
        )
      })}
    </div>
  )
}

function DifficultyToggle() {
  const t = useT()
  const difficulty = useApp((s) => s.difficulty)
  const setDifficulty = useApp((s) => s.setDifficulty)
  const easy = difficulty === 'easy'
  return (
    <button
      className="bt-btn bt-difficulty"
      data-testid="difficulty"
      data-value={difficulty}
      aria-label={t('difficulty')}
      onClick={() => setDifficulty(easy ? 'normal' : 'easy')}
    >
      {easy ? `🐣 ${t('difficultyEasy')}` : `🦁 ${t('difficultyNormal')}`}
    </button>
  )
}

function CelebrationOverlay({ onBrowse }: { onBrowse: () => void }) {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const celebration = useGuided((s) => s.celebration)
  const [confirming, setConfirming] = useState(false)
  if (!celebration) return null
  const template = getTemplate(celebration.templateId)

  const toCity = () => {
    useGuided.getState().dismissCelebration()
    useApp.getState().setMode('city')
  }
  const openInWorkshop = () => {
    const bp = useGame.getState().data.blueprints.find((b) => b.id === celebration.blueprintId)
    if (!bp) return
    useEditor.getState().loadBricks(bp.bricks.map((b) => ({ ...b })), bp.kind, { ...bp.baseplate }, bp.id)
    useGuided.getState().dismissCelebration()
    useApp.getState().setMode('workshop')
  }
  const onEdit = () => {
    // Opening replaces the kid's current free-build model: ask first if there is one.
    if (workshopHasBricks()) setConfirming(true)
    else openInWorkshop()
  }
  const again = () => {
    useGuided.getState().dismissCelebration()
    onBrowse()
  }

  return (
    <div className="bt-celebrate" data-testid="celebration" role="dialog" aria-label={t('celebrateTitle')}>
      <Confetti />
      <div className="bt-celebrate-card">
        <div className="bt-celebrate-title">🎉 {t('celebrateTitle')}</div>
        {template && <div className="bt-celebrate-name">{template.name[lang]}</div>}
        <div className="bt-row">
          <button className="bt-btn bt-celebrate-btn" data-testid="celebrate-city" onClick={toCity}>
            🏙️ {t('addToCity')}
          </button>
          <button className="bt-btn bt-celebrate-btn" data-testid="celebrate-edit" onClick={onEdit}>
            🧱 {t('editFree')}
          </button>
          <button
            className="bt-btn bt-icon-btn"
            data-testid="celebrate-again"
            aria-label={t('buildAnother')}
            onClick={again}
          >
            📋
          </button>
        </div>
      </div>
      {/* Outside the card: its entry animation would make it the containing block of the fixed backdrop. */}
      {confirming && (
        <ConfirmDialog messageKey="confirmReplaceWorkshop" onYes={openInWorkshop} onNo={() => setConfirming(false)} />
      )}
    </div>
  )
}

/** HTML overlay of a Guided Build: step counter, needed bricks, difficulty, and (normal mode) palette. */
export default function GuidedUI({ onBrowse }: { onBrowse: () => void }) {
  const t = useT()
  const guided = useGame((s) => s.data.guided)
  const celebrating = useGuided((s) => s.celebration !== null)
  const viewStep = useGuided((s) => s.viewStep)
  const easy = useApp((s) => s.difficulty === 'easy')
  const template = guided ? getTemplate(guided.templateId) : undefined

  if (celebrating) return <CelebrationOverlay onBrowse={onBrowse} />
  if (!guided || !template) return null

  const stepParts = [...new Set((template.steps[viewStep] ?? []).map((i) => template.bricks[i].p))]
  return (
    <div className="bt-workshop-ui bt-guided-ui" data-easy={easy}>
      <StepNav total={template.steps.length} />
      <div className="bt-topright">
        <DifficultyToggle />
        <button className="bt-btn bt-icon-btn" data-testid="guided-list" aria-label={t('guidedList')} onClick={onBrowse}>
          📋
        </button>
      </div>
      <NeededPanel template={template} guided={guided} />
      {!easy && (
        <>
          <ColorPicker />
          <PartPalette allowedParts={stepParts} />
        </>
      )}
    </div>
  )
}
