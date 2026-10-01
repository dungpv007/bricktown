import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installAudioUnlock } from './audio/sfx'
import Boot from './ui/Boot'
import './index.css'
import './ui/theme.css'

async function start() {
  if (import.meta.env.DEV) await import('./devHandle')
  installAudioUnlock()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Boot />
    </StrictMode>,
  )
}

void start()
