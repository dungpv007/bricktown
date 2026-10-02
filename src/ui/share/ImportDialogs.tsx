import { useMemo, useRef, useState } from 'react'
import type { AuthoringIssue } from '../../core/authoring'
import type { ShareErrorCode, SharePackage } from '../../core/share'
import type { ImportPlan } from '../../core/shareImport'
import { getThumbnail } from '../../render/thumbnails'
import { mazeThumbnail } from '../../scenes/maze/mazeThumbnail'
import { useApp } from '../../state/useApp'
import { useMazeEditor } from '../../state/useMazeEditor'
import { useShareImport, type Incoming } from '../../state/useShareImport'
import { KIND_ICON } from '../blueprintKinds'
import ConfirmDialog from '../ConfirmDialog'
import { useT, type TKey } from '../i18n'
import { useThumbnail } from '../useThumbnail'
import { issueText } from './authoringText'
import { cityThumbnail } from './cityThumbnail'
import './share.css'

const ERROR_KEY: Record<ShareErrorCode, TKey> = {
  corrupt: 'importErrCorrupt',
  too_big: 'importErrTooBig',
  unsupported: 'importErrUnsupported',
  invalid: 'importErrInvalid',
}

const ERROR_ICON: Record<ShareErrorCode, string> = { corrupt: '🧩', too_big: '🐘', unsupported: '🆕', invalid: '🧩' }

const seconds = (ms: number) => `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`

/** Icon of what is being imported. */
function kindIcon(plan: ImportPlan): string {
  if (plan.kind === 'maze') return '🌀'
  if (plan.kind === 'city') return '🏙️'
  return KIND_ICON[plan.blueprint.kind]
}

let previewSeq = 0

/** Picture of the creation: the model in 3D, the maze or the city from above. */
function PreviewThumb({ plan }: { plan: ImportPlan }) {
  const key = useMemo(() => `import:${++previewSeq}`, [])
  const bricks = plan.kind === 'model' ? plan.blueprint.bricks : []
  const modelUrl = useThumbnail(key, () => (bricks.length ? getThumbnail(key, bricks) : Promise.resolve('')))
  const flatUrl = useMemo(() => {
    if (plan.kind === 'maze') return mazeThumbnail(key, plan.maze)
    if (plan.kind === 'city') return cityThumbnail(plan.city, plan.blueprints)
    return ''
  }, [key, plan])
  const url = plan.kind === 'model' ? modelUrl : flatUrl
  if (!url) return <span className="bt-import-thumb bt-thumb-fallback" aria-hidden="true">{kindIcon(plan)}</span>
  return <img className={`bt-import-thumb bt-import-thumb-${plan.kind}`} src={url} alt="" draggable={false} />
}

function Count({ icon, value, labelKey, testId }: { icon: string; value: string | number; labelKey: TKey; testId?: string }) {
  const t = useT()
  return (
    <span className="bt-import-count" data-testid={testId}>
      <span aria-hidden="true">{icon}</span> {value} {t(labelKey)}
    </span>
  )
}

/** What the import holds, as icon + number chips. */
function Counts({ plan }: { plan: ImportPlan }) {
  const t = useT()
  if (plan.kind === 'model') {
    return (
      <div className="bt-import-counts">
        <Count icon="🧱" value={plan.brickCount} labelKey="importBricks" testId="import-bricks" />
        {plan.template && <Count icon="📋" value={plan.template.steps.length} labelKey="importSteps" testId="import-steps" />}
      </div>
    )
  }
  if (plan.kind === 'maze') {
    return (
      <div className="bt-import-counts">
        <span className="bt-import-count">
          <span aria-hidden="true">📐</span> {plan.maze.w}×{plan.maze.h}
        </span>
        {plan.maze.coins.length > 0 && <Count icon="🪙" value={plan.maze.coins.length} labelKey="importCoins" />}
        {plan.challenge && (
          <span className="bt-import-count bt-import-challenge" data-testid="import-challenge">
            <span aria-hidden="true">🏁</span> {t('mazeChallengeBeat')} {seconds(plan.challenge.timeMs)}?
          </span>
        )}
      </div>
    )
  }
  return (
    <div className="bt-import-counts">
      <Count icon="🏠" value={plan.city.placements.length} labelKey="importPlacements" testId="import-placements" />
      <Count icon="🛣️" value={plan.city.roads.length} labelKey="importRoads" />
      {plan.blueprints.length > 0 && <Count icon="🧱" value={plan.blueprints.length} labelKey="importModels" />}
    </div>
  )
}

function ErrorCard({ error, problems }: { error: ShareErrorCode; problems?: AuthoringIssue[] }) {
  const t = useT()
  const lang = useApp((s) => s.lang)
  const dismiss = useShareImport((s) => s.dismiss)
  return (
    <div className="bt-dialog bt-import bt-import-error" role="alertdialog" aria-label={t(ERROR_KEY[error])} data-testid="import-error" data-error={error}>
      <span className="bt-import-error-icon" aria-hidden="true">{ERROR_ICON[error]}</span>
      <p className="bt-ask-text">{t(ERROR_KEY[error])}</p>
      {problems && problems.length > 0 && (
        <ul className="bt-import-problems" data-testid="import-problems">
          {problems.map((p, i) => (
            <li key={i}>{issueText(p, lang)}</li>
          ))}
        </ul>
      )}
      <button className="bt-btn bt-yes" data-testid="import-error-ok" aria-label={t('close')} onClick={dismiss}>
        ✓
      </button>
    </div>
  )
}

/** The city replaces the kid's own as a whole, so a non-empty city asks a second time. */
const replacesSomething = (plan: ImportPlan) => plan.kind === 'city' && plan.replaces.placements + plan.replaces.roads > 0

function Preview({ pkg, plan, fixed }: { pkg: SharePackage; plan: ImportPlan; fixed?: number }) {
  const t = useT()
  const { confirm, dismiss } = useShareImport.getState()
  const [asking, setAsking] = useState(false)
  const add = () => {
    confirm()
  }
  const onYes = () => (replacesSomething(plan) ? setAsking(true) : add())
  return (
    <div className="bt-dialog bt-import" role="dialog" aria-label={pkg.name} data-testid="import-preview" data-kind={plan.kind}>
      <PreviewThumb plan={plan} />
      <p className="bt-share-name">
        <span aria-hidden="true">{kindIcon(plan)}</span> <span data-testid="import-name">{pkg.name}</span>
      </p>
      {plan.kind === 'model' && plan.template && (
        <p className="bt-share-hint" data-testid="import-with-steps">
          <span aria-hidden="true">📋</span> {t('importWithSteps')}
        </p>
      )}
      {fixed ? (
        <p className="bt-share-hint bt-import-fixed" data-testid="import-fixed">
          <span aria-hidden="true">🔧</span> {t('importAutoFixed').replace('{n}', String(fixed))}
        </p>
      ) : null}
      <Counts plan={plan} />
      <div className="bt-row">
        <button className="bt-btn bt-no" data-testid="import-cancel" aria-label={t('close')} onClick={dismiss}>
          ✗
        </button>
        <button className="bt-btn bt-yes bt-import-yes" data-testid="import-confirm" onClick={onYes}>
          ✓ {t(plan.kind === 'city' ? 'importReplaceCity' : 'importAdd')}
        </button>
      </div>
      {asking && <ConfirmDialog messageKey="confirmReplaceCity" onNo={() => setAsking(false)} onYes={add} />}
    </div>
  )
}

/** "Added!" with a shortcut to where the creation now is. */
function Done({ plan }: { plan: ImportPlan }) {
  const t = useT()
  const dismiss = useShareImport((s) => s.dismiss)
  const go = (() => {
    if (plan.kind === 'model' && plan.template) return { icon: '📋', key: 'menuGuided' as const, run: () => useApp.getState().setMode('guided') }
    if (plan.kind === 'maze')
      return {
        icon: '🌀',
        key: 'menuMaze' as const,
        run: () => {
          useMazeEditor.getState().close()
          useApp.getState().setMode('maze')
        },
      }
    if (plan.kind === 'city') return { icon: '🏙️', key: 'menuCity' as const, run: () => useApp.getState().setMode('city') }
    return null
  })()
  return (
    <div className="bt-dialog bt-import" role="dialog" aria-label={t('importDone')} data-testid="import-done">
      <span className="bt-import-error-icon" aria-hidden="true">🎉</span>
      <p className="bt-ask-text">
        {t('importDone')} <span aria-hidden="true">{kindIcon(plan)}</span> {plan.name}
      </p>
      <div className="bt-row">
        {go && (
          <button
            className="bt-btn bt-import-go"
            data-testid="import-go"
            onClick={() => {
              dismiss()
              go.run()
            }}
          >
            <span aria-hidden="true">{go.icon}</span> {t(go.key)}
          </button>
        )}
        <button className="bt-btn bt-yes" data-testid="import-done-ok" aria-label={t('close')} onClick={dismiss}>
          ✓
        </button>
      </div>
    </div>
  )
}

function ImportPreview({ incoming }: { incoming: Incoming }) {
  return incoming.status === 'error'
    ? <ErrorCard error={incoming.error} problems={incoming.problems} />
    : <Preview pkg={incoming.pkg} plan={incoming.plan} fixed={incoming.fixed} />
}

/** 📥: pick a `.bricktown` file or paste a link a friend sent. */
function ImportPicker() {
  const t = useT()
  const { closePicker, receiveFile, receiveText } = useShareImport.getState()
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <form
      className="bt-dialog bt-import-picker"
      role="dialog"
      aria-label={t('importShared')}
      data-testid="import-picker"
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim()) receiveText(text, 'paste')
      }}
    >
      <span className="bt-dialog-kind" aria-hidden="true">📥</span>
      <button type="button" className="bt-btn bt-share-act bt-share-main" data-testid="import-pick-file" onClick={() => fileRef.current?.click()}>
        <span className="bt-share-act-icon" aria-hidden="true">📁</span>
        {t('importPickFile')}
      </button>
      <input
        ref={fileRef}
        className="bt-hidden-input"
        type="file"
        accept=".bricktown,.json,application/json"
        data-testid="import-file-input"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0]
          e.currentTarget.value = ''
          if (file) void receiveFile(file)
        }}
      />
      <div className="bt-import-paste">
        <span aria-hidden="true">🔗</span>
        <input
          className="bt-input"
          data-testid="import-paste"
          aria-label={t('importPasteLink')}
          placeholder={t('importPasteLink')}
          value={text}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="bt-row">
        <button type="button" className="bt-btn bt-no" data-testid="import-picker-close" aria-label={t('close')} onClick={closePicker}>
          ✗
        </button>
        <button type="submit" className="bt-btn bt-yes" data-testid="import-paste-go" aria-label={t('open')} disabled={!text.trim()}>
          ✓
        </button>
      </div>
    </form>
  )
}

/** The import dialogs (lazy chunk: the model preview needs the 3D renderer). */
export default function ImportDialogs() {
  const pickerOpen = useShareImport((s) => s.pickerOpen)
  const incoming = useShareImport((s) => s.incoming)
  const done = useShareImport((s) => s.done)
  // A preview or error card closes only with its own button: the link is already gone from the address
  // bar, so a stray tap beside the card must not lose a friend's creation.
  const close = () => {
    const s = useShareImport.getState()
    if (s.incoming) return
    if (s.done) s.dismiss()
    else s.closePicker()
  }
  if (!pickerOpen && !incoming && !done) return null
  return (
    <div className="bt-modal-backdrop bt-share-backdrop" onClick={close}>
      <div className="bt-share-stop" onClick={(e) => e.stopPropagation()}>
        {incoming ? <ImportPreview incoming={incoming} /> : done ? <Done plan={done} /> : <ImportPicker />}
      </div>
    </div>
  )
}
