import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installAudioUnlock } from './audio/sfx'
import { flushAutosave } from './persistence/autosave'
import Boot from './ui/Boot'
import './index.css'
import './ui/theme.css'
import { useApp } from './state/useApp'
import { useCityEditor } from './state/useCityEditor'
import { useEditor } from './state/useEditor'
import { useGame } from './state/useGame'
import { useGuided } from './state/useGuided'

if (import.meta.env.DEV) {
  ;(window as unknown as { __bt: unknown }).__bt = { useApp, useGame, useEditor, useCityEditor, useGuided, flushAutosave }
}

installAudioUnlock()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
)
