import { useCallback, useMemo, useState, type MouseEvent } from 'react'
import * as sfx from '../../audio/sfx'
import { sampleCity } from '../../content/cities/sample'
import {
  MAX_CITIES,
  cityDisplayName,
  cityIsEmpty,
  emptyCity,
  sanitizeCityName,
} from '../../core/cities'
import { buildCityPackage } from '../../core/share'
import type { Blueprint, SavedCity } from '../../core/types'
import { useGame } from '../../state/useGame'
import ConfirmDialog from '../../ui/ConfirmDialog'
import { useT } from '../../ui/i18n'
import ShareDialog from '../../ui/share/ShareDialog'
import { cityThumbnail } from '../../ui/share/cityThumbnail'

/**
 * 🏙️ The kid's cities: a card per city (a map from above, its name, the one being played marked),
 * tap one to play it; ✏️ rename, 📋 duplicate, 🗑️ delete (never the last one), 🔗 share; ➕ makes a
 * new city, empty or a copy of the sample town. At most `MAX_CITIES` per save slot.
 */

/** "Thành phố 2", "Thành phố 3"...: the first number no other city's shown name uses. */
function newCityName(names: Set<string>, pattern: string): string {
  for (let n = 2; ; n++) {
    const name = pattern.replace('{n}', String(n))
    if (!names.has(name)) return name
  }
}

function CityThumb({ city, blueprints }: { city: SavedCity['city']; blueprints: Blueprint[] }) {
  const url = useMemo(() => cityThumbnail(city, blueprints), [city, blueprints])
  if (!url)
    return (
      <span className="bt-city-thumb bt-thumb-fallback" aria-hidden="true">
        🏙️
      </span>
    )
  return <img className="bt-city-thumb" src={url} alt="" draggable={false} />
}

type CityAct = 'rename' | 'duplicate' | 'delete' | 'share'

function CityCard(props: {
  saved: SavedCity
  name: string
  current: boolean
  only: boolean
  full: boolean
  blueprints: Blueprint[]
  onOpen: () => void
  onAct: (act: CityAct) => void
}) {
  const { saved, name, current, only, full, blueprints, onOpen, onAct } = props
  const t = useT()
  const empty = cityIsEmpty(saved.city)
  const act = (a: CityAct) => (e: MouseEvent) => {
    e.stopPropagation() // not also "open this city"
    onAct(a)
  }
  return (
    // The whole card opens the city (its actions stop the tap): a big target for small fingers.
    <div
      className="bt-city-card"
      data-testid={`city-card-${saved.id}`}
      data-current={current}
      onClick={onOpen}
    >
      {/* Its tap reaches the card's (no handler of its own): the button is there for keyboards and screen readers. */}
      <button
        className="bt-city-open"
        data-testid="city-open"
        aria-label={name}
        aria-current={current}
      >
        <CityThumb city={saved.city} blueprints={blueprints} />
        {current && (
          <span className="bt-city-badge" data-testid="city-current">
            ⭐ {t('cityCurrent')}
          </span>
        )}
        <span className="bt-city-name" data-testid="city-name">
          {name}
        </span>
      </button>
      <div className="bt-city-acts">
        <button
          className="bt-btn bt-city-act"
          data-testid="city-rename"
          aria-label={t('cityRename')}
          onClick={act('rename')}
        >
          ✏️
        </button>
        <button
          className="bt-btn bt-city-act"
          data-testid="city-duplicate"
          aria-label={t('cityDuplicate')}
          disabled={full}
          onClick={act('duplicate')}
        >
          📋
        </button>
        <button
          className="bt-btn bt-city-act"
          data-testid="city-delete"
          aria-label={only ? t('cityKeepOne') : t('cityDelete')}
          disabled={only}
          onClick={act('delete')}
        >
          🗑️
        </button>
        <button
          className="bt-btn bt-city-act"
          data-testid="city-share"
          aria-label={empty ? t('shareCityEmpty') : t('share')}
          disabled={empty}
          onClick={act('share')}
        >
          🔗
        </button>
      </div>
    </div>
  )
}

/** ✏️ A big name field; the name is cleaned when saved (empty = the default name). */
function RenameDialog({
  initial,
  onSave,
  onClose,
}: {
  initial: string
  onSave: (name: string) => void
  onClose: () => void
}) {
  const t = useT()
  const [text, setText] = useState(initial)
  return (
    <div className="bt-modal-backdrop bt-ask-backdrop" onClick={onClose}>
      <form
        className="bt-dialog"
        role="dialog"
        aria-label={t('cityRename')}
        data-testid="city-rename-dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          onSave(sanitizeCityName(text))
        }}
      >
        <span className="bt-dialog-kind" aria-hidden="true">
          ✏️
        </span>
        <input
          className="bt-input"
          data-testid="city-rename-input"
          aria-label={t('cityNamePlaceholder')}
          placeholder={t('cityNamePlaceholder')}
          value={text}
          maxLength={40}
          autoFocus
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
        />
        <div className="bt-row">
          <button
            type="button"
            className="bt-btn bt-no"
            data-testid="city-rename-cancel"
            aria-label={t('close')}
            onClick={onClose}
          >
            ✗
          </button>
          <button
            type="submit"
            className="bt-btn bt-yes"
            data-testid="city-rename-ok"
            aria-label={t('yes')}
          >
            ✓
          </button>
        </div>
      </form>
    </div>
  )
}

/** A message with one ✓ (the 20-city cap). */
function Notice({ text, testId, onClose }: { text: string; testId: string; onClose: () => void }) {
  const t = useT()
  return (
    <div className="bt-modal-backdrop bt-ask-backdrop" onClick={onClose}>
      <div
        className="bt-dialog bt-ask"
        role="alertdialog"
        aria-label={text}
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="bt-ask-text">
          <span aria-hidden="true">🏙️🗑️ </span>
          {text}
        </p>
        <button
          className="bt-btn bt-yes"
          data-testid={`${testId}-ok`}
          aria-label={t('close')}
          onClick={onClose}
        >
          ✓
        </button>
      </div>
    </div>
  )
}

/** 🔗 Shares one of the kid's cities (not necessarily the one being played) with the models it uses. */
function ShareSavedCity({
  city,
  name,
  onClose,
}: {
  city: SavedCity
  name: string
  onClose: () => void
}) {
  const build = useCallback(
    () => buildCityPackage(city.city, useGame.getState().data.blueprints, { name }),
    [city, name],
  )
  return <ShareDialog build={build} icon="🏙️" onClose={onClose} />
}

type Pending =
  | { kind: 'new' }
  | { kind: 'full' }
  | { kind: 'rename'; city: SavedCity }
  | { kind: 'delete'; city: SavedCity }
  | { kind: 'share'; city: SavedCity }
  | null

/** The picker dialog. Playing another city (or a new one) closes it. */
export function CityPickerDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const cities = useGame((s) => s.data.cities)
  const currentId = useGame((s) => s.data.currentCityId)
  const blueprints = useGame((s) => s.data.blueprints)
  const [pending, setPending] = useState<Pending>(null)
  const full = cities.length >= MAX_CITIES
  const fallback = t('cityDefaultName')
  const nameOf = useCallback((c: SavedCity) => cityDisplayName(c, fallback), [fallback])
  const game = useGame.getState

  const open = (id: string) => {
    if (id !== currentId) {
      game().switchCity(id)
      sfx.pop()
    }
    onClose()
  }
  const makeNew = (kind: 'empty' | 'sample') => {
    const names = new Set(cities.map(nameOf))
    const id =
      kind === 'empty'
        ? game().addCity(emptyCity(), newCityName(names, t('cityNewName')))
        : game().addCity(
            sampleCity(),
            names.has(t('citySampleName'))
              ? newCityName(names, `${t('citySampleName')} {n}`)
              : t('citySampleName'),
          )
    setPending(null)
    if (id === null) {
      setPending({ kind: 'full' })
      return
    }
    sfx.pop()
    onClose() // straight into the new city
  }
  const onAct = (city: SavedCity) => (act: CityAct) => {
    if (act === 'duplicate') {
      if (game().duplicateCity(city.id, t('cityCopyName').replace('{name}', nameOf(city))) === null)
        setPending({ kind: 'full' })
      else sfx.pop()
    } else setPending({ kind: act, city })
  }

  // The dialogs on top are siblings of the picker's backdrop, not inside it: their taps never reach it.
  return (
    <>
      <div className="bt-modal-backdrop" onClick={onClose}>
        <div
          className="bt-dialog bt-city-picker"
          role="dialog"
          aria-label={t('cityPickTitle')}
          data-testid="city-picker-dialog"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bt-city-picker-head">
            <h2 className="bt-city-picker-title">
              <span aria-hidden="true">🏙️</span> {t('cityPickTitle')}{' '}
              <span className="bt-city-count" data-testid="city-count">
                {cities.length}/{MAX_CITIES}
              </span>
            </h2>
            <button
              className="bt-btn bt-no bt-city-picker-close"
              data-testid="city-picker-close"
              aria-label={t('close')}
              onClick={onClose}
            >
              ✕
            </button>
          </div>
          <div className="bt-city-grid">
            <button
              className={`bt-card bt-city-new${full ? ' bt-city-new-full' : ''}`}
              data-testid="city-new"
              onClick={() => setPending({ kind: full ? 'full' : 'new' })}
            >
              <span className="bt-card-icon" aria-hidden="true">
                ➕
              </span>
              {t('cityNew')}
            </button>
            {cities.map((c) => (
              <CityCard
                key={c.id}
                saved={c}
                name={nameOf(c)}
                current={c.id === currentId}
                only={cities.length <= 1}
                full={full}
                blueprints={blueprints}
                onOpen={() => open(c.id)}
                onAct={onAct(c)}
              />
            ))}
          </div>
        </div>
      </div>
      {pending?.kind === 'new' && (
        <div className="bt-modal-backdrop bt-ask-backdrop" onClick={() => setPending(null)}>
          <div
            className="bt-dialog bt-maze-choose"
            role="dialog"
            aria-label={t('cityNew')}
            data-testid="city-new-choose"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="bt-ask-text">
              <span aria-hidden="true">➕ </span>
              {t('cityNew')}
            </p>
            <div className="bt-row">
              <button
                className="bt-btn bt-maze-choice bt-maze-choice-big bt-city-new-empty"
                data-testid="city-new-empty"
                onClick={() => makeNew('empty')}
              >
                <span aria-hidden="true">🟩</span> {t('cityNewEmpty')}
              </button>
              <button
                className="bt-btn bt-maze-choice bt-maze-choice-big bt-city-new-sample"
                data-testid="city-new-sample"
                onClick={() => makeNew('sample')}
              >
                <span aria-hidden="true">🏙️</span> {t('cityNewSample')}
              </button>
            </div>
            <button
              className="bt-btn bt-no"
              data-testid="city-new-close"
              aria-label={t('close')}
              onClick={() => setPending(null)}
            >
              ✗
            </button>
          </div>
        </div>
      )}
      {pending?.kind === 'full' && (
        <Notice
          text={t('cityFull').replace('{n}', String(MAX_CITIES))}
          testId="city-full"
          onClose={() => setPending(null)}
        />
      )}
      {pending?.kind === 'rename' && (
        <RenameDialog
          initial={nameOf(pending.city)}
          onClose={() => setPending(null)}
          onSave={(name) => {
            // The default name typed back (or nothing) stays the default: it then follows the language.
            game().renameCity(pending.city.id, name === fallback ? '' : name)
            setPending(null)
          }}
        />
      )}
      {pending?.kind === 'delete' && (
        <ConfirmDialog
          messageKey="confirmDeleteCity"
          onNo={() => setPending(null)}
          onYes={() => {
            if (game().deleteCity(pending.city.id)) sfx.pop()
            setPending(null)
          }}
        />
      )}
      {pending?.kind === 'share' && (
        <ShareSavedCity
          city={pending.city}
          name={nameOf(pending.city)}
          onClose={() => setPending(null)}
        />
      )}
    </>
  )
}

/** The 🏙️ button in the City's top row; opens the picker. */
export default function CityPickerButton() {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        className="bt-btn bt-city-picker-btn"
        data-testid="city-picker"
        aria-label={t('cityPicker')}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">🏙️</span> {t('cityPicker')}
      </button>
      {open && <CityPickerDialog onClose={() => setOpen(false)} />}
    </>
  )
}
