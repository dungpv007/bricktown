const CONFETTI_COLORS = ['#e3000b', '#ffd500', '#0055bf', '#237841', '#fe8a18', '#fc97ac']
const CONFETTI_COUNT = 48

/** Falling paper confetti over a celebration (CSS animation; still under reduced motion). */
export default function Confetti() {
  return (
    <div className="bt-confetti" aria-hidden="true">
      {Array.from({ length: CONFETTI_COUNT }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${((i * 53) % 100) / 40}s`,
            animationDuration: `${2.4 + ((i * 17) % 10) / 6}s`,
          }}
        />
      ))}
    </div>
  )
}
