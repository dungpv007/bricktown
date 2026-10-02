import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installMusic } from './audio/music'
import { installAudioUnlock } from './audio/sfx'
import { registerUpdates } from './pwa/registerUpdates'
import Boot from './ui/Boot'
import { retryFailedScenesOnMenu } from './ui/SceneBoundary'
import { installTestLowPower } from './testLowPower'
import './index.css'
import './ui/theme.css'

async function start() {
  installTestLowPower()
  if (import.meta.env.DEV) await import('./devHandle')
  installAudioUnlock()
  installMusic()
  registerUpdates()
  retryFailedScenesOnMenu()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Boot />
    </StrictMode>,
  )
}

void start()
