import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { useApp, type Mode } from './state/useApp'
import { useGame } from './state/useGame'
import { useGuided } from './state/useGuided'
import GuidedPicker from './scenes/guided/GuidedPicker'
import GuidedScene from './scenes/guided/GuidedScene'
import GuidedUI from './scenes/guided/GuidedUI'
import WorkshopScene from './scenes/workshop/WorkshopScene'
import WorkshopUI from './scenes/workshop/WorkshopUI'
import CityScene from './scenes/city/CityScene'
import CityUI from './scenes/city/CityUI'
import { DriveLoading } from './scenes/drive/DriveUI'
import VehiclePicker from './scenes/drive/VehiclePicker'
import MainMenu from './ui/MainMenu'
import TopBar from './ui/TopBar'
import type { TKey } from './ui/i18n'

// Lazy: only Drive mode downloads the physics engine (Rapier WASM).
const DriveScene = lazy(() => import('./scenes/drive/DriveScene'))

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
      <WorkshopScene />
      <WorkshopUI />
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
      {showPicker ? (
        <GuidedPicker onPick={() => setBrowsing(false)} />
      ) : (
        <>
          <GuidedScene />
          <GuidedUI onBrowse={() => setBrowsing(true)} />
        </>
      )}
    </div>
  )
}

function City() {
  return (
    <div className="bt-screen" data-testid="mode-city">
      <CityScene />
      <CityUI />
    </div>
  )
}

/** Vehicle picker, then the chosen vehicle driving around the city. */
function Drive() {
  const [source, setSource] = useState<string | null>(null)
  const pickAgain = useCallback(() => setSource(null), [])
  return (
    <div className="bt-screen" data-testid="mode-drive">
      {source === null ? (
        <VehiclePicker onPick={setSource} />
      ) : (
        <Suspense fallback={<DriveLoading />}>
          <DriveScene source={source} onChangeVehicle={pickAgain} />
        </Suspense>
      )}
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
