import { useState } from 'react'
import { findGuidedTemplate, useGuidedTemplate } from '../../state/guidedTemplates'
import { useApp } from '../../state/useApp'
import { useEditor, workshopHasBricks } from '../../state/useEditor'
import { useGame } from '../../state/useGame'
import { useGuided } from '../../state/useGuided'
import ConfirmDialog from '../../ui/ConfirmDialog'
import Confetti from '../../ui/Confetti'
import { useT } from '../../ui/i18n'
import GuidedTray from './GuidedTray'


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
  const template = findGuidedTemplate(celebration.templateId)

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

/** HTML overlay of a Guided Build: step counter, difficulty, and the piece tray to drag from. */
export default function GuidedUI({ onBrowse }: { onBrowse: () => void }) {
  const t = useT()
  const guided = useGame((s) => s.data.guided)
  const celebrating = useGuided((s) => s.celebration !== null)
  const easy = useApp((s) => s.difficulty === 'easy')
  const template = useGuidedTemplate(guided?.templateId)

  if (celebrating) return <CelebrationOverlay onBrowse={onBrowse} />
  if (!guided || !template) return null

  return (
    <div className="bt-workshop-ui bt-guided-ui" data-easy={easy}>
      <StepNav total={template.steps.length} />
      <div className="bt-topright">
        <DifficultyToggle />
        <button className="bt-btn bt-icon-btn" data-testid="guided-list" aria-label={t('guidedList')} onClick={onBrowse}>
          📋
        </button>
      </div>
      <GuidedTray template={template} guided={guided} />
    </div>
  )
}
