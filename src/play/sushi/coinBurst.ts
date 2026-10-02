import { prefersReducedMotion } from '../../state/useApp'

/**
 * Coins flying from the happy customer to the round's coin pill: plain DOM elements moved by the Web
 * Animations API (no React renders, no 3D frames). `onLand` runs as each coin arrives.
 */
export function flyCoins(layer: HTMLElement, from: { x: number; y: number }, to: HTMLElement, count: number, onLand: () => void): () => void {
  const timers: number[] = []
  const coins: HTMLElement[] = []
  const box = layer.getBoundingClientRect()
  const end = to.getBoundingClientRect()
  const tx = end.left + end.width * 0.3 - box.left
  const ty = end.top + end.height / 2 - box.top
  const fx = from.x - box.left
  const fy = from.y - box.top
  const reduced = prefersReducedMotion()
  for (let i = 0; i < count; i++) {
    timers.push(
      window.setTimeout(() => {
        if (reduced) return onLand()
        const el = document.createElement('span')
        el.className = 'bt-sushi-coin'
        el.textContent = '🪙'
        el.setAttribute('aria-hidden', 'true')
        layer.appendChild(el)
        coins.push(el)
        // Out and up from the customer in a little fan, then an arc into the pill.
        const sx = fx + (i - (count - 1) / 2) * 34
        const sy = fy - 50 - (i % 2) * 18
        const anim = el.animate(
          [
            { transform: `translate(${fx}px, ${fy}px) scale(0.3)`, opacity: 0 },
            { transform: `translate(${sx}px, ${sy}px) scale(1.25)`, opacity: 1, offset: 0.3 },
            { transform: `translate(${(sx + tx) / 2}px, ${Math.min(sy, ty) - 40}px) scale(1.1)`, opacity: 1, offset: 0.6 },
            { transform: `translate(${tx}px, ${ty}px) scale(0.7)`, opacity: 1 },
          ],
          { duration: 900, easing: 'ease-in-out', fill: 'forwards' },
        )
        anim.onfinish = () => {
          el.remove()
          onLand()
        }
      }, i * 140),
    )
  }
  return () => {
    for (const t of timers) window.clearTimeout(t)
    for (const el of coins) el.remove()
  }
}
