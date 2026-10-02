import { Html } from '@react-three/drei'
import type { Brick } from '../../core/types'
import { getThumbnail } from '../../render/thumbnails'
import { useThumbnail } from '../../ui/useThumbnail'

/**
 * A picture of something ordered: a brick model rendered to a thumbnail (`bricks`, memoised under
 * `key`), or just an emoji. `count` > 1 shows "×N".
 */
export interface OrderItem {
  /** Stable id of the picture (thumbnail cache key, React key). */
  key: string
  bricks?: Brick[]
  emoji?: string
  count?: number
}

function OrderPicture({ item }: { item: OrderItem }) {
  const bricks = item.bricks
  const url = useThumbnail(`order:${item.key}`, () => (bricks ? getThumbnail(`order:${item.key}`, bricks) : Promise.resolve('')))
  return (
    <span className="bt-order-item" data-testid={`order-item-${item.key}`}>
      {url ? <img src={url} alt="" draggable={false} /> : <span className="bt-order-emoji">{item.emoji ?? '❓'}</span>}
      {item.count !== undefined && item.count > 1 && <span className="bt-order-count">×{item.count}</span>}
    </span>
  )
}

export interface OrderBubbleProps {
  items: OrderItem[]
  /** Where the bubble's tail points (in the parent group; default: right here). */
  position?: [number, number, number]
  /** A ✓ over the bubble (order done). */
  done?: boolean
}

/**
 * A speech bubble of pictures (no reading needed), floating in the 3D scene, e.g. as the `above` of
 * a `CustomerQueue`. Taps pass through it to the scene.
 */
export default function OrderBubble({ items, position = [0, 0, 0], done = false }: OrderBubbleProps) {
  return (
    <Html position={position} center zIndexRange={[0, 0]} pointerEvents="none">
      <div className="bt-order-bubble" data-testid="order-bubble" data-done={done}>
        {items.map((item) => (
          <OrderPicture key={item.key} item={item} />
        ))}
        {done && <span className="bt-order-done" aria-hidden="true">✓</span>}
      </div>
    </Html>
  )
}
