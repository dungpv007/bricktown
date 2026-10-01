import type { BlueprintKind } from '../core/types'
import type { TKey } from './i18n'

export const KIND_ICON: Record<BlueprintKind, string> = {
  building: '🏠',
  vehicle: '🚗',
  prop: '🪑',
}

export const DEFAULT_NAME_KEY: Record<BlueprintKind, TKey> = {
  building: 'defaultNameBuilding',
  vehicle: 'defaultNameVehicle',
  prop: 'defaultNameProp',
}
