import { create } from 'zustand'
import { getTemplate } from '../content/templates'
import { isShareError, parseShareHash, parseShareText, type ShareError, type ShareErrorCode, type SharePackage } from '../core/share'
import { applyImport, planImport, type ImportPlan, type ShareImportOptions } from '../core/shareImport'
import { t } from '../ui/i18n'
import { useApp, type Lang } from './useApp'
import { notifyCityReplaced } from './cityReplaced'
import { useGame } from './useGame'

/**
 * Receiving a friend's creation: from a link the app was opened with (`#s=`), a picked or dropped
 * `.bricktown` file, or a pasted link. Whatever arrives is validated (core/share) and previewed;
 * nothing touches the save until the kid confirms.
 */

export type ShareSource = 'link' | 'file' | 'paste'

export type Incoming =
  | { status: 'preview'; pkg: SharePackage; plan: ImportPlan; source: ShareSource }
  | { status: 'error'; error: ShareErrorCode; source: ShareSource }

/** A share file is a few kB, a city at most a few hundred; anything far larger is refused unread. */
export const MAX_SHARE_FILE_BYTES = 4 * 1024 * 1024

/** What `receiveFile` needs of a File (a Blob works too). */
export interface ShareFile {
  size: number
  text(): Promise<string>
}

export interface ShareImportState {
  /** What is being previewed (or why it could not be read). */
  incoming: Incoming | null
  /** The import just confirmed, for the "added!" card. */
  done: ImportPlan | null
  /** The 📥 dialog: pick a file or paste a link. */
  pickerOpen: boolean
  /** Bumped by every new import or picker opening, so the dialog's error boundary starts fresh. */
  seq: number
  openPicker: () => void
  closePicker: () => void
  receiveText: (text: string, source: ShareSource) => void
  /** A share link's hash (`#s=...`). */
  receiveHash: (hash: string) => void
  receiveFile: (file: ShareFile) => Promise<void>
  /** Adds the previewed creation to the save; returns what was added (null when nothing was previewed). */
  confirm: () => ImportPlan | null
  /** Closes the preview, the error card or the "added!" card. */
  dismiss: () => void
}

/** Built-in template sizes (city placements) and names for nameless creations in the kid's language. */
export function shareImportOptions(lang: Lang = useApp.getState().lang): ShareImportOptions {
  return {
    templateSize: (id) => getTemplate(id)?.baseplate,
    names: { model: t('shareKindModel', lang), maze: t('mazeDefaultName', lang), city: t('menuCity', lang) },
  }
}

/**
 * The share hash the page was opened with (`#s=...`), or null. A share hash is removed from the
 * address right away, so a reload or bookmark never offers the same import again.
 */
export function consumeShareHash(
  location: Pick<Location, 'hash' | 'pathname' | 'search'>,
  history: Pick<History, 'replaceState'>,
): string | null {
  const { hash } = location
  if (!new URLSearchParams(hash.replace(/^#/, '')).has('s')) return null
  history.replaceState(null, '', `${location.pathname}${location.search}`)
  return hash
}

export const useShareImport = create<ShareImportState>()((set, get) => {
  const receive = (parsed: SharePackage | ShareError, source: ShareSource) => {
    if (isShareError(parsed)) {
      set((s) => ({ incoming: { status: 'error', error: parsed.error, source }, done: null, pickerOpen: false, seq: s.seq + 1 }))
      return
    }
    const plan = planImport(useGame.getState().data, parsed)
    set((s) => ({ incoming: { status: 'preview', pkg: parsed, plan, source }, done: null, pickerOpen: false, seq: s.seq + 1 }))
  }

  return {
    incoming: null,
    done: null,
    pickerOpen: false,
    seq: 0,
    openPicker: () => set((s) => ({ pickerOpen: true, seq: s.seq + 1 })),
    closePicker: () => set({ pickerOpen: false }),

    receiveText: (text, source) => receive(parseShareText(text, shareImportOptions()), source),

    receiveHash: (hash) => receive(parseShareHash(hash, shareImportOptions()) ?? { error: 'corrupt' }, 'link'),

    receiveFile: async (file) => {
      if (file.size > MAX_SHARE_FILE_BYTES) {
        receive({ error: 'too_big' }, 'file')
        return
      }
      let text: string
      try {
        text = await file.text()
      } catch {
        receive({ error: 'corrupt' }, 'file')
        return
      }
      get().receiveText(text, 'file')
    },

    confirm: () => {
      const { incoming } = get()
      if (incoming?.status !== 'preview') return null
      // Planned again against the save as it is now, so the new ids cannot collide with anything added meanwhile.
      const game = useGame.getState()
      const plan = planImport(game.data, incoming.pkg)
      game.update((d) => applyImport(d, plan))
      if (plan.kind === 'city') {
        notifyCityReplaced() // the City editor forgets its undo history: undo must not bring the old city back
        // Driving collides with the city that was just replaced: go back to the city instead.
        if (useApp.getState().mode === 'drive') useApp.getState().setMode('city')
      }
      set({ incoming: null, done: plan })
      return plan
    },

    dismiss: () => set({ incoming: null, done: null }),
  }
})
