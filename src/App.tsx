import { useEffect, useState } from 'react'
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
import MainMenu from './ui/MainMenu'
import TopBar from './ui/TopBar'
import { useT, type TKey } from './ui/i18n'

type PlayMode = Exclude<Mode, 'menu'>

const TITLE_KEYS: Record<PlayMode, TKey> = {
  workshop: 'menuWorkshop',
  guided: 'menuGuided',
  city: 'menuCity',
  drive: 'menuDrive',
}

function ModePlaceholder({ mode }: { mode: PlayMode }) {
  const t = useT()
  return (
    <div className="bt-screen bt-placeholder" data-testid={`mode-${mode}`}>
      {t('comingSoon')}
    </div>
  )
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

function Play({ mode }: { mode: PlayMode }) {
  if (mode === 'workshop') return <Workshop />
  if (mode === 'guided') return <Guided />
  if (mode === 'city') return <City />
  return <ModePlaceholder mode={mode} />
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
