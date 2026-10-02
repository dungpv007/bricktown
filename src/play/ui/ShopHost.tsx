import SceneBoundary from '../../ui/SceneBoundary'
import { lazyScene } from '../../ui/lazyScene'
import { usePlayUi } from '../usePlay'

// The hub (with the shop tab) is its own chunk: it draws part and figure thumbnails (three.js).
const PlayHub = lazyScene(() => import('./PlayHub'))

/** The 🛍️ shop over any screen, opened by tapping a 🔒 item in a palette (`usePlayUi.openShop`). */
export default function ShopHost() {
  const open = usePlayUi((s) => s.shopOpen)
  const close = usePlayUi((s) => s.closeShop)
  if (!open) return null
  return (
    <SceneBoundary>
      <PlayHub initialTab="shop" onClose={close} />
    </SceneBoundary>
  )
}

export { PlayHub as LazyPlayHub }
