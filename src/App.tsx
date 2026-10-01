import { useApp, type Mode } from './state/useApp'
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

function City() {
  return (
    <div className="bt-screen" data-testid="mode-city">
      <CityScene />
      <CityUI />
    </div>
  )
}

export default function App() {
  const mode = useApp((s) => s.mode)
  if (mode === 'menu') return <MainMenu />
  return (
    <>
      {mode === 'workshop' ? <Workshop /> : mode === 'city' ? <City /> : <ModePlaceholder mode={mode} />}
      <TopBar titleKey={TITLE_KEYS[mode]} />
    </>
  )
}
