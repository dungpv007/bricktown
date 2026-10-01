import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Boot from './ui/Boot'
import './index.css'
import './ui/theme.css'
import { useApp } from './state/useApp'
import { useEditor } from './state/useEditor'
import { useGame } from './state/useGame'
import { useGuided } from './state/useGuided'

if (import.meta.env.DEV) {
  ;(window as unknown as { __bt: unknown }).__bt = { useApp, useGame, useEditor, useGuided }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
)
