import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import './ui/theme.css'
import { useApp } from './state/useApp'
import { useEditor } from './state/useEditor'
import { useGame } from './state/useGame'

if (import.meta.env.DEV) {
  ;(window as unknown as { __bt: unknown }).__bt = { useApp, useGame, useEditor }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
