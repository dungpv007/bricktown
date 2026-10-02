import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { coin as coinSound, pop, success, whoosh } from '../../audio/sfx'
import { useT } from '../../ui/i18n'
import {
  BrickModel,
  CustomerQueue,
  DragArena,
  DragItem,
  DropTarget,
  GameStage,
  HintHand,
  ProgressBar,
  RoundSummary,
  useRound,
  type GameSceneProps,
  type Mood,
  type StageCamera,
} from '../kit'
import { STICKER_BY_ID, statsOf } from '../stickers'
import { usePlayData } from '../usePlay'
import { beep } from './beep'
import { ITEM_BRICKS, ITEM_EMOJI } from './items'
import { changeDone, CUSTOMERS_PER_ROUND, customerReward, giveChange, planRound, PRICES, type Customer, type Level } from './logic'
import { basketSlot, beltSlot, Belt, Bubble, HANDS, LAYOUT, ON_SCANNER, PopIn, PricePop, Scanner, ShopProps, TestHandle, type Vec3 } from './scene'
import { ChangeTray, CoinRow, NOTES, PayButton, TillScreen } from './Till'
import './grocery.css'

/**
 * Grocery cashier (`grocery`): a customer puts 2-5 brick-built goods on the belt; the kid drags each
 * one over the scanner (beep, flash, price), the till shows the total in big digits and coins, then
 * the customer pays: on Bé nhỏ the kid just taps "pay"; on Bé lớn the kid counts the change out of
 * the drawer (up to 20) while dots light up. A happy hop, coins fly to the wallet, next customer.
 * Four customers a round, then the kit's summary (coins, stickers). No fail state: a coin that is
 * too much just wobbles back.
 */

type Step = 'walk' | 'unload' | 'scan' | 'pay' | 'change' | 'thanks'
type ItemState = 'hidden' | 'hand' | 'belt' | 'scan' | 'bag' | 'gone'

const CAMERA: StageCamera = { position: [0, 18, 18], target: [0, 2.4, -1.4], fov: 40, fitWidth: 23 }
const BACKDROP = { wall: '#F6E7B8', floor: '#D9C9A3', counter: '#237841', counterTop: '#F4F4F4' }
const FROM: [number, number] = [-24, LAYOUT.customer[1] - 2]
const TO: [number, number] = [24, LAYOUT.customer[1] - 2]
const UNLOAD_GAP_MS = 380
const THANKS_MS = 1600

/** The sticker the summary counts toward: "super cashier", after 5 rounds. */
const MILESTONE = STICKER_BY_ID.grocery_5

/** The level chosen last (kept while the app runs, so 🔁 and the next visit start there). */
let lastLevel: Level = 'small'

const newRng = (): (() => number) => Math.random

/** Timeouts that are all cleared together (a new customer, leaving the game). */
function useTimers() {
  const ids = useRef<number[]>([])
  const clear = useCallback(() => {
    ids.current.forEach((id) => window.clearTimeout(id))
    ids.current = []
  }, [])
  useEffect(() => clear, [clear])
  const later = useCallback((fn: () => void, ms: number) => {
    ids.current.push(window.setTimeout(fn, ms))
  }, [])
  return { later, clear }
}

/** Coins flying from the till up to the wallet (🪙 in the top bar). `burst` changes start a flight. */
function FlyingCoins({ burst, count }: { burst: number; count: number }) {
  const [flight, setFlight] = useState<{ id: number; dx: number; dy: number } | null>(null)
  useEffect(() => {
    if (burst === 0) return
    const wallet = document.querySelector('[data-testid="play-coins"]')?.getBoundingClientRect()
    const fromX = window.innerWidth / 2
    const fromY = window.innerHeight * 0.55
    const dx = wallet ? wallet.left + wallet.width / 2 - fromX : window.innerWidth / 2 - 40
    const dy = wallet ? wallet.top + wallet.height / 2 - fromY : -fromY + 30
    const start = window.setTimeout(() => setFlight({ id: burst, dx, dy }), 0)
    const end = window.setTimeout(() => setFlight(null), 1500)
    return () => {
      window.clearTimeout(start)
      window.clearTimeout(end)
    }
  }, [burst])
  if (!flight) return null
  return (
    <div className="g-fly" aria-hidden="true" key={flight.id}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="g-fly-coin"
          style={{ '--g-dx': `${flight.dx}px`, '--g-dy': `${flight.dy}px`, '--g-spread': `${(i - (count - 1) / 2) * 34}px`, animationDelay: `${i * 90}ms` } as CSSProperties}
        >
          🪙
        </span>
      ))}
    </div>
  )
}

/** Before the round: the cart and two big level buttons (Bé nhỏ: no change; Bé lớn: change). */
function LevelPicker({ onPick }: { onPick: (level: Level) => void }) {
  const t = useT()
  return (
    <div className="bt-play-overlay" data-testid="round-intro">
      <div className="bt-play-card">
        <span className="bt-play-card-icon" aria-hidden="true">🛒</span>
        <div className="g-levels">
          <button className="bt-btn bt-yes g-level" data-testid="grocery-level-small" data-last={lastLevel === 'small'} onClick={() => onPick('small')}>
            <span className="g-level-icon" aria-hidden="true">🐣</span>
            <span className="g-level-name">{t('groceryLevelSmall')}</span>
            <span className="g-level-pic" aria-hidden="true">
              <span className="g-coin g-coin-1">3</span> ✓
            </span>
          </button>
          <button className="bt-btn g-level g-level-big" data-testid="grocery-level-big" data-last={lastLevel === 'big'} onClick={() => onPick('big')}>
            <span className="g-level-icon" aria-hidden="true">🦁</span>
            <span className="g-level-name">{t('groceryLevelBig')}</span>
            <span className="g-level-pic" aria-hidden="true">
              <span className="g-coin g-coin-10">10</span> ➜ <span className="g-coin g-coin-1">1</span>
              <span className="g-coin g-coin-2">2</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

/** On the summary: how far the kid is toward the "super cashier" sticker (5 rounds). */
function Milestone() {
  const play = usePlayData()
  const rounds = statsOf(play, 'grocery').rounds
  if (play.stickers.includes(MILESTONE.id)) return null
  return (
    <div className="g-milestone" data-testid="grocery-milestone" data-rounds={rounds} aria-label={`${Math.min(rounds, 5)} / 5`}>
      <span className="g-milestone-icon" aria-hidden="true">{MILESTONE.icon}</span>
      <span className="g-milestone-dots" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="g-dot" data-on={i < rounds} />
        ))}
      </span>
    </div>
  )
}

export default function GroceryGame({ gameId, onExit }: GameSceneProps) {
  const round = useRound({ gameId, customers: CUSTOMERS_PER_ROUND })
  const [level, setLevel] = useState<Level>(lastLevel)
  const [plan, setPlan] = useState<{ id: number; customers: Customer[] }>(() => ({ id: 0, customers: planRound(lastLevel, newRng()) }))
  const [step, setStep] = useState<Step>('walk')
  const [items, setItems] = useState<ItemState[]>([])
  const [running, setRunning] = useState(0)
  const [given, setGiven] = useState(0)
  const [mood, setMood] = useState<Mood>('idle')
  const [flash, setFlash] = useState(0)
  const [priceTag, setPriceTag] = useState<{ id: number; price: number; emoji: string }>({ id: 0, price: 0, emoji: '' })
  const [burst, setBurst] = useState(0)
  const { later, clear } = useTimers()

  const customer = plan.customers[round.customer] as Customer | undefined
  const figs = useMemo(() => plan.customers.map((c) => c.fig), [plan])
  // The latest item states, for callbacks that run between renders (two drops in a row).
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  })

  const resetCustomer = useCallback(() => {
    clear()
    setStep('walk')
    setItems([])
    setRunning(0)
    setGiven(0)
    setMood('idle')
  }, [clear])

  const begin = (picked: Level) => {
    lastLevel = picked
    setLevel(picked)
    setPlan((p) => ({ id: p.id + 1, customers: planRound(picked, newRng()) }))
    resetCustomer()
    round.start()
  }

  const again = () => {
    setPlan((p) => ({ id: p.id + 1, customers: planRound(level, newRng()) }))
    resetCustomer()
    round.again()
  }

  /** The customer reached the till: the goods go on the belt one by one. */
  const arrive = (index: number) => {
    const c = plan.customers[index]
    if (!c || index !== round.customer || step !== 'walk') return
    setStep('unload')
    setItems(c.items.map(() => 'hidden'))
    c.items.forEach((_, i) => {
      later(() => setItems((s) => s.map((v, j) => (j === i ? 'hand' : v))), i * UNLOAD_GAP_MS)
      later(() => {
        pop()
        setItems((s) => s.map((v, j) => (j === i && v === 'hand' ? 'belt' : v)))
      }, i * UNLOAD_GAP_MS + 90)
    })
    later(() => setStep((s) => (s === 'unload' ? 'scan' : s)), c.items.length * UNLOAD_GAP_MS + 100)
  }

  const scanned = items.filter((s) => s === 'scan' || s === 'bag').length

  /** An item dropped: over the scanner it beeps, flashes, rings up its price and drops into the basket. */
  const drop = (i: number) => (target: string | null): boolean => {
    if (!customer || target !== 'scanner' || itemsRef.current[i] !== 'belt') return false
    const kind = customer.items[i]
    const price = PRICES[kind]
    const next = itemsRef.current.map((v, j) => (j === i ? 'scan' : v)) as ItemState[]
    itemsRef.current = next
    setItems(next)
    beep()
    setFlash((f) => f + 1)
    setPriceTag((p) => ({ id: p.id + 1, price, emoji: ITEM_EMOJI[kind] }))
    setRunning((r) => r + price)
    later(() => setItems((s) => s.map((v, j) => (j === i ? 'bag' : v))), 520)
    if (next.every((v) => v === 'scan' || v === 'bag')) {
      later(() => {
        success()
        setStep(customer.change > 0 ? 'change' : 'pay')
      }, 900)
    }
    return true
  }

  /** The customer is paid (and has their change): happy hop, coins to the wallet, then the next one. */
  const thanks = () => {
    if (!customer) return
    setStep('thanks')
    setMood('happy')
    setBurst((b) => b + 1)
    whoosh()
    later(coinSound, 700)
    // The customer takes the goods.
    setItems((s) => s.map((v) => (v === 'hidden' ? v : 'gone')))
    later(() => {
      resetCustomer()
      round.serve(customerReward(level))
    }, THANKS_MS)
  }

  const pay = () => {
    if (step !== 'pay') return
    coinSound()
    thanks()
  }

  const giveCoin = (c: number): boolean => {
    if (step !== 'change' || !customer) return false
    if (changeDone(given, customer.change)) return false // complete: a late tap is not a mistake
    const next = giveChange(given, c, customer.change)
    if (next === null) {
      round.mistake()
      setMood('no')
      later(() => setMood((m) => (m === 'no' ? 'idle' : m)), 800)
      return false
    }
    setGiven(next)
    if (changeDone(next, customer.change)) later(thanks, c * 150 + 350)
    return true
  }

  // Where each item rests now (its DragItem home).
  const bagOrder = useMemo(() => {
    const order: number[] = []
    items.forEach((s, i) => {
      if (s === 'scan' || s === 'bag' || s === 'gone') order.push(i)
    })
    return order
  }, [items])
  const homeOf = (i: number): Vec3 => {
    const s = items[i]
    if (s === 'hand' || s === 'hidden' || s === 'gone') return HANDS
    if (s === 'bag') return basketSlot(Math.max(0, bagOrder.indexOf(i)))
    return beltSlot(i)
  }

  const testItems = () => items.map((s, i) => ({ state: s, at: homeOf(i) }))
  const nextToScan = items.indexOf('belt')
  const canScan = step === 'unload' || step === 'scan'
  const arrived = round.phase === 'serving' && step !== 'walk'

  let above = null
  if (arrived && customer) {
    if (step === 'thanks') above = <Bubble testId="grocery-happy">😍</Bubble>
    else if (step === 'change') above = <Bubble testId="grocery-paid"><CoinRow amount={customer.paid} coins={NOTES} /></Bubble>
    else if (step === 'pay') above = <Bubble testId="grocery-paid"><CoinRow amount={customer.total} /></Bubble>
    else above = <Bubble>🛒</Bubble>
  }

  return (
    <>
      <GameStage camera={CAMERA} backdrop={BACKDROP} background="#fdf3d6">
        <ShopProps />
        <Belt />
        <Scanner flash={flash} />
        <PricePop id={priceTag.id} price={priceTag.price} emoji={priceTag.emoji} />
        <DragArena>
          <CustomerQueue
            customers={figs}
            current={round.phase === 'serving' ? round.customer : figs.length}
            spot={LAYOUT.customer}
            from={FROM}
            to={TO}
            mood={mood}
            onArrive={arrive}
            above={above}
          />
          <DropTarget id="scanner" position={ON_SCANNER} radius={LAYOUT.scannerRadius} />
          {customer &&
            items.map((s, i) =>
              s === 'hidden' ? null : (
                <DragItem
                  key={`${plan.id}-${round.customer}-${i}`}
                  id={`item${i}`}
                  position={homeOf(i)}
                  lift={1.6}
                  grabSize={[2.4, 3.4, 3.2]}
                  disabled={!canScan || s !== 'belt'}
                  onDrop={drop(i)}
                >
                  <PopIn scale={s === 'gone' ? 0 : s === 'bag' ? 0.8 : 1}>
                    <BrickModel bricks={ITEM_BRICKS[customer.items[i]]} />
                  </PopIn>
                </DragItem>
              ),
            )}
          {nextToScan >= 0 && (
            <HintHand at={beltSlot(nextToScan)} to={ON_SCANNER} active={canScan && round.phase === 'serving'} resetKey={`${round.customer}-${scanned}`} />
          )}
        </DragArena>
        <TestHandle items={testItems} />
      </GameStage>
      <div className="bt-play-hud-top">
        <ProgressBar done={round.customer} total={round.total} icon="🛍️" />
      </div>
      {round.phase === 'serving' && arrived && (
        <div className="g-till" data-testid="grocery-till" data-step={step} data-level={level}>
          <TillScreen total={running} />
          {step === 'pay' && customer && <PayButton total={customer.total} onPay={pay} />}
          {step === 'change' && customer && (
            <ChangeTray key={`${plan.id}-${round.customer}`} paid={customer.paid} change={customer.change} given={given} onCoin={giveCoin} />
          )}
        </div>
      )}
      <FlyingCoins burst={burst} count={customerReward(level)} />
      {round.phase === 'intro' && <LevelPicker onPick={begin} />}
      {round.phase === 'summary' && (
        <>
          <RoundSummary outcome={round.outcome} onAgain={again} onExit={onExit} />
          <Milestone />
        </>
      )}
    </>
  )
}
