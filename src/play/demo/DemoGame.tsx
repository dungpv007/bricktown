import { useMemo, useState } from 'react'
import type { Brick } from '../../core/types'
import {
  BrickModel,
  CustomerQueue,
  DragArena,
  DragItem,
  DropTarget,
  GameStage,
  HintHand,
  OrderBubble,
  ProgressBar,
  RoundIntro,
  RoundSummary,
  STAGE,
  brick,
  useRound,
  type GameSceneProps,
  type Mood,
} from '../kit'

/**
 * The dev-only demo (registered as `demo`): the smallest game built on the kit, to prove the flow
 * (and as a reference for the real games). Three customers each order a red or a blue block by
 * picture; the kid drags the right one onto the plate. A wrong one wobbles back: try again.
 */

const CUSTOMERS = ['customer', 'customer2', 'kid']
const ORDERS: Array<'red' | 'blue'> = ['red', 'blue', 'red']
const FOOD: Record<'red' | 'blue', Brick[]> = {
  red: [brick('brick_2x2', 2), brick('plate_2x2', 4, 0, 3)],
  blue: [brick('brick_2x2', 3), brick('plate_2x2', 0, 0, 3)],
}
const TOP = STAGE.counterTop
const HOME: Record<'red' | 'blue', [number, number, number]> = { red: [-5, TOP, 1.5], blue: [5, TOP, 1.5] }
const PLATE: [number, number, number] = [0, TOP, -0.5]
const PLATE_BRICKS = [brick('plate_4x4', 0)]

export default function DemoGame({ gameId, onExit }: GameSceneProps) {
  const round = useRound({ gameId, customers: CUSTOMERS.length })
  const [arrived, setArrived] = useState(-1)
  const [mood, setMood] = useState<Mood>('idle')
  const [served, setServed] = useState<number | null>(null)
  const want = ORDERS[round.customer] ?? 'red'
  const ready = round.phase === 'serving' && arrived === round.customer && served === null
  const order = useMemo(() => [{ key: `demo-${want}`, bricks: FOOD[want] }], [want])

  const drop = (food: 'red' | 'blue') => (target: string | null) => {
    if (target !== 'plate' || !ready) return false
    if (food !== want) {
      round.mistake()
      setMood('no')
      window.setTimeout(() => setMood('idle'), 900)
      return false
    }
    setServed(round.customer)
    setMood('happy')
    window.setTimeout(() => {
      setMood('idle')
      setServed(null)
      round.serve()
    }, 1200)
    return true
  }

  return (
    <>
      <GameStage>
        <DragArena>
          <CustomerQueue
            customers={CUSTOMERS}
            current={round.phase === 'intro' ? CUSTOMERS.length : round.customer}
            mood={mood}
            onArrive={setArrived}
            above={<OrderBubble items={order} done={served !== null} />}
          />
          <DropTarget id="plate" position={PLATE} radius={4}>
            <BrickModel bricks={PLATE_BRICKS} />
          </DropTarget>
          {(['red', 'blue'] as const).map((food) => (
            <DragItem
              // A fresh item for each customer: the served one is eaten.
              key={`${food}-${round.customer}`}
              id={food}
              position={HOME[food]}
              disabled={!ready}
              onDrop={drop(food)}
            >
              <BrickModel bricks={FOOD[food]} position={[0, 0.4, 0]} />
            </DragItem>
          ))}
          <HintHand at={HOME[want]} to={PLATE} active={ready} resetKey={round.customer} />
        </DragArena>
      </GameStage>
      <div className="bt-play-hud-top">
        <ProgressBar done={round.customer} total={round.total} />
      </div>
      {round.phase === 'intro' && <RoundIntro icon="🧪" onStart={round.start} />}
      {round.phase === 'summary' && <RoundSummary outcome={round.outcome} onAgain={round.again} onExit={onExit} />}
    </>
  )
}
