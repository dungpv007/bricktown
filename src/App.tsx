import { useCallback, useEffect, useState } from 'react'
import { useApp, type Mode } from './state/useApp'
import { useGame } from './state/useGame'
import { useGuided } from './state/useGuided'
import { useHasOpenMaze, useMazeEditor } from './state/useMazeEditor'
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
const MazePicker = lazyScene(() => import('./scenes/maze/MazePicker'))
const MazeScene = lazyScene(() => import('./scenes/maze/MazeScene'))
const MazeUI = lazyScene(() => import('./scenes/maze/MazeUI'))
const MazeDrivePlaceholder = lazyScene(() => import('./scenes/maze/MazeDrivePlaceholder'))

type PlayMode = Exclude<Mode, 'menu'>

const TITLE_KEYS: Record<PlayMode, TKey> = {
  workshop: 'menuWorkshop',
  guided: 'menuGuided',
  city: 'menuCity',
  drive: 'menuDrive',
  maze: 'menuMaze',
  mazeDrive: 'menuMaze',
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

/** Maze picker, or the open maze in the editor (the kid's maze is saved as it changes). */
function Maze() {
  const editing = useHasOpenMaze()
  return (
    <div className="bt-screen" data-testid="mode-maze">
      <SceneBoundary>
        {editing ? (
          <>
            <MazeScene />
            <MazeUI />
          </>
        ) : (
          <MazePicker />
        )}
      </SceneBoundary>
    </div>
  )
}

function MazeDrive() {
  return (
    <div className="bt-screen" data-testid="mode-mazeDrive">
      <SceneBoundary>
        <MazeDrivePlaceholder />
      </SceneBoundary>
    </div>
  )
}

function Play({ mode }: { mode: PlayMode }) {
  if (mode === 'workshop') return <Workshop />
  if (mode === 'guided') return <Guided />
  if (mode === 'city') return <City />
  if (mode === 'maze') return <Maze />
  if (mode === 'mazeDrive') return <MazeDrive />
  return <Drive />
}

/** Back from the maze editor goes to the maze picker, from driving a maze to its editor. */
function useBack(mode: PlayMode): (() => void) | undefined {
  const editingMaze = useHasOpenMaze()
  const setMode = useApp((s) => s.setMode)
  if (mode === 'maze' && editingMaze) return () => useMazeEditor.getState().close()
  if (mode === 'mazeDrive') return () => setMode('maze')
  return undefined
}

function PlayScreen({ mode }: { mode: PlayMode }) {
  const onBack = useBack(mode)
  return (
    <>
      <Play mode={mode} />
      <TopBar titleKey={TITLE_KEYS[mode]} onBack={onBack} />
    </>
  )
}

export default function App() {
  const mode = useApp((s) => s.mode)
  if (mode === 'menu') return <MainMenu />
  return <PlayScreen mode={mode} />
}
