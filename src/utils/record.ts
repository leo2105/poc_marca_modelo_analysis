import type { ValidationRecord, ValidationState } from '../types'
import { displayModelName } from './catalog'

export type MosaicDisplayState = ValidationState | 'pending-model'

export function getRecordPerspectives(record: ValidationRecord): string[] {
  const perspectives = record.perspectives?.filter(Boolean).slice(0, 4) ?? []
  if (perspectives.length > 0) return perspectives
  return [record.image]
}

export function getEffectiveClassification(record: ValidationRecord): { brand: string; model: string } {
  if (record.curated) return record.curated
  return record.detected
}

export function isModelInCatalog(
  brand: string,
  model: string,
  displayCatalog: Record<string, string[]>,
): boolean {
  return (displayCatalog[brand] ?? []).some((label) => displayModelName(label) === displayModelName(model))
}

/** Marca reasignada y el modelo actual no pertenece al catálogo de esa marca. */
export function isPendingModel(
  record: ValidationRecord,
  displayCatalog: Record<string, string[]>,
): boolean {
  const effective = getEffectiveClassification(record)
  const brandChanged = effective.brand !== record.detected.brand
  if (!brandChanged) return false
  return !isModelInCatalog(effective.brand, effective.model, displayCatalog)
}

export function getMosaicDisplayState(
  record: ValidationRecord,
  displayCatalog: Record<string, string[]>,
): MosaicDisplayState {
  if (isPendingModel(record, displayCatalog)) return 'pending-model'
  if (record.state === 'rejected') return 'discarded'
  return record.state
}

export function isPendingLike(
  record: ValidationRecord,
  displayCatalog: Record<string, string[]>,
): boolean {
  return record.state === 'pending' || isPendingModel(record, displayCatalog)
}

export type PanelBucket = 'approved' | 'pending' | 'discarded' | 'corrected'

/** Mapeo mosaico → panel de corrida. */
export function mosaicStateToPanelBucket(mosaicState: MosaicDisplayState): PanelBucket {
  switch (mosaicState) {
    case 'approved':
      return 'approved'
    case 'corrected':
      return 'corrected'
    case 'pending':
    case 'pending-model':
      return 'pending'
    case 'rejected':
    case 'discarded':
      return 'discarded'
  }
}

export function getPanelBucket(
  record: ValidationRecord,
  displayCatalog: Record<string, string[]>,
): PanelBucket {
  return mosaicStateToPanelBucket(getMosaicDisplayState(record, displayCatalog))
}

/** Pendiente modelo siempre persiste como state pending (no corrected). */
export function withPendingModelState(
  record: ValidationRecord,
  displayCatalog: Record<string, string[]>,
): ValidationRecord {
  if (
    isPendingModel(record, displayCatalog) &&
    record.state !== 'discarded' &&
    record.state !== 'rejected' &&
    record.state !== 'approved'
  ) {
    return {
      ...record,
      state: 'pending',
      includedInReport: false,
    }
  }
  return record
}

export function isPanelDiscarded(record: ValidationRecord, displayCatalog: Record<string, string[]>): boolean {
  return getPanelBucket(record, displayCatalog) === 'discarded'
}

export function isHiddenFromView(record: ValidationRecord): boolean {
  return Boolean(record.hiddenFromView)
}

export function isDiscardedRecord(record: ValidationRecord): boolean {
  const state = record.state === 'rejected' ? 'discarded' : record.state
  return state === 'discarded' || isHiddenFromView(record)
}

export function isPanelApproved(record: ValidationRecord, displayCatalog: Record<string, string[]>): boolean {
  return getPanelBucket(record, displayCatalog) === 'approved'
}

export function isPanelCorrected(
  record: ValidationRecord,
  displayCatalog: Record<string, string[]>,
): boolean {
  return getPanelBucket(record, displayCatalog) === 'corrected'
}

export function isPanelPending(
  record: ValidationRecord,
  displayCatalog: Record<string, string[]>,
): boolean {
  return getPanelBucket(record, displayCatalog) === 'pending'
}

export function isResolved(
  record: ValidationRecord,
  displayCatalog: Record<string, string[]>,
): boolean {
  return !isPendingLike(record, displayCatalog)
}

export function getClassificationChanges(
  record: ValidationRecord,
  displayCatalog?: Record<string, string[]>,
) {
  const effective = getEffectiveClassification(record)
  const brandChanged = effective.brand !== record.detected.brand
  const modelChanged = effective.model !== record.detected.model
  const pendingModel = displayCatalog ? isPendingModel(record, displayCatalog) : false
  const corrected =
    !pendingModel &&
    record.state === 'corrected' &&
    record.curated !== null &&
    (brandChanged || modelChanged)
  return { effective, brandChanged, modelChanged, corrected, pendingModel }
}
