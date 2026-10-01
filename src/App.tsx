import { useCallback, useEffect, useState } from 'react'
import { useApp, type Mode } from './state/useApp'
import { useGame } from './state/useGame'
import { useGuided } from './state/useGuided'
import MainMenu from './ui/MainMenu'
import SceneBoundary from './ui/SceneBoundary'
import { lazyScene } from './ui/lazyScene'
import TopBar from './ui/TopBar'
import type { TKey } from './ui/i18n'

// Each mode's 3D scene (and its UI) is its own chunk, so the menu loads fast and the heavy
// parts download on first use; the service worker precaches them all for offline play.
// Drive additionally carries the physics engine (Rapier WASM). `lazyScene` retries a failed download
// and reloads once when a chunk is gone after an app update.
const WorkshopScene = lazyScene(() => import('./scenes/workshop/WorkshopScene'))
const WorkshopUI = lazyScene(() => import('./scenes/workshop/WorkshopUI'))
const GuidedPicker = lazyScene(() => import('./scenes/guided/GuidedPicker'))
const GuidedScene = lazyScene(() => import('./scenes/guided/GuidedScene'))
const GuidedUI = lazyScene(() => import('./scenes/guided/GuidedUI'))
const CityScene = lazyScene(() => import('./scenes/city/CityScene'))
const CityUI = lazyScene(() => import('./scenes/city/CityUI'))
const VehiclePicker = lazyScene(() => import('./scenes/drive/VehiclePicker'))
const DriveScene = lazyScene(() => import('./scenes/drive/DriveScene'))

type PlayMode = Exclude<Mode, 'menu'>

const TITLE_KEYS: Record<PlayMode, TKey> = {
  workshop: 'menuWorkshop',
  guided: 'menuGuided',
  city: 'menuCity',
  drive: 'menuDrive',
}

function Workshop() {
  return (
    <div className="bt-screen" data-testid="mode-workshop">
      <SceneBoundary>
        <WorkshopScene />
        <WorkshopUI />
      </SceneBoundary>
    </div>
  )
}

/** Template picker, or the build in progress (resumed on entry), or the celebration after finishing. */
function Guided() {
  const hasBuild = useGame((s) => s.data.guided !== null)
  const celebrating = useGuided((s) => s.celebration !== null)
  const [browsing, setBrowsing] = useState(false)
  useEffect(() => {
    const g = useGuided.getState()
    g.dismissCelebration()
    g.resume()
  }, [])
  const showPicker = !celebrating && (browsing || !hasBuild)
  return (
    <div className="bt-screen" data-testid="mode-guided">
      <SceneBoundary>
        {showPicker ? (
          <GuidedPicker onPick={() => setBrowsing(false)} />
        ) : (
          <>
            <GuidedScene />
            <GuidedUI onBrowse={() => setBrowsing(true)} />
          </>
        )}
      </SceneBoundary>
    </div>
  )
}

function City() {
  return (
    <div className="bt-screen" data-testid="mode-city">
      <SceneBoundary>
        <CityScene />
        <CityUI />
      </SceneBoundary>
    </div>
  )
}

/** Vehicle picker, then the chosen vehicle driving around the city. */
function Drive() {
  const [source, setSource] = useState<string | null>(null)
  const pickAgain = useCallback(() => setSource(null), [])
  return (
    <div className="bt-screen" data-testid="mode-drive">
      <SceneBoundary>
        {source === null ? (
          <VehiclePicker onPick={setSource} />
        ) : (
          <DriveScene source={source} onChangeVehicle={pickAgain} />
        )}
      </SceneBoundary>
    </div>
  )
}

function Play({ mode }: { mode: PlayMode }) {
  if (mode === 'workshop') return <Workshop />
  if (mode === 'guided') return <Guided />
  if (mode === 'city') return <City />
  return <Drive />
}

export default function App() {
  const mode = useApp((s) => s.mode)
  if (mode === 'menu') return <MainMenu />
  return (
    <>
      <Play mode={mode} />
      <TopBar titleKey={TITLE_KEYS[mode]} />
    </>
  )
}
