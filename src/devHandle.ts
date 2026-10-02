import { flushAutosave } from './persistence/autosave'
import { usePersistStatus } from './persistence/status'
import { cityScreen } from './scenes/city/cityScreen'
import { mazeScreen } from './scenes/maze/mazeScreen'
import { renderStats } from './render/renderStats'
import { plateScreen } from './scenes/workshop/plateScreen'
import { npcStats } from './state/npcStats'
import { useApp } from './state/useApp'
import { useCityEditor } from './state/useCityEditor'
import { useEditor } from './state/useEditor'
import { useGame } from './state/useGame'
import { useGuided } from './state/useGuided'
import { useMazeEditor } from './state/useMazeEditor'

// Dev only (imported dynamically from main.tsx): lets e2e specs and manual checks reach the stores.
// Kept out of the production boot path because the city editor pulls in three.js.
;(window as unknown as { __bt: unknown }).__bt = { useApp, useGame, useEditor, useCityEditor, useGuided, usePersistStatus, flushAutosave, plateScreen, useMazeEditor, mazeScreen, cityScreen, npcStats, npcCount: () => npcStats.count,
  // The live scene's renderer (pixel ratio, info) and its frame counter; scenes render on demand, so
  // specs that wait for frames ask for them.
  renderStats, renderer: () => renderStats.gl, invalidate: () => renderStats.invalidate() }
