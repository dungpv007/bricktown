/**
 * The role-play kit: everything a game in `src/play/<game>/` builds on. Import from here:
 *   import { GameStage, CustomerQueue, useRound, RoundSummary, ... } from '../kit'
 * See the module of each piece for details.
 */
export { default as GameStage, STAGE, DEFAULT_CAMERA, CounterBackdrop, StageLights, type GameStageProps, type StageCamera, type BackdropColors } from './GameStage'
export { BrickModel, Minifig, brick, figureBrick, MINIFIG_HEIGHT, type BrickModelProps, type MinifigProps } from './BrickModel'
export { default as CustomerQueue, type CustomerQueueProps, type Mood } from './CustomerQueue'
export { default as OrderBubble, type OrderBubbleProps, type OrderItem } from './OrderBubble'
export { DragArena, DragItem, DropTarget, type DragItemProps, type DropTargetProps } from './Draggable'
export { Tappable, useWobble, type TappableProps } from './Tappable'
export { default as HintHand, useIdle, HINT_IDLE_MS, type HintHandProps } from './HintHand'
export { useRound, roundReducer, newRound, type Round, type RoundState, type RoundAction, type RoundPhase, type UseRoundOptions } from './round'
export { CoinCounter, ProgressBar, RoundIntro, RoundSummary, StickerBadge, useCountUp } from './hud'
export { useFrameRequest } from '../../render/frameDriver'
export { COINS_PER_CUSTOMER } from '../rewards'
export type { GameSceneProps } from '../registry'
