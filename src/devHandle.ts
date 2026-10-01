import { flushAutosave } from './persistence/autosave'
import { usePersistStatus } from './persistence/status'
import { plateScreen } from './scenes/workshop/plateScreen'
import { useApp } from './state/useApp'
import { useCityEditor } from './state/useCityEditor'
import { useEditor } from './state/useEditor'
import { useGame } from './state/useGame'
import { useGuided } from './state/useGuided'

// Dev only (imported dynamically from main.tsx): lets e2e specs and manual checks reach the stores.
// Kept out of the production boot path because the city editor pulls in three.js.
;(window as unknown as { __bt: unknown }).__bt = { useApp, useGame, useEditor, useCityEditor, useGuided, usePersistStatus, flushAutosave, plateScreen }
