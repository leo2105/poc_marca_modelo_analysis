import type { ValidationDecisionDelta, ValidationRecord, ValidationSessionSnapshot } from '../types'
import type { Catalog } from '../types'
import { createDemoRecords, EVENT_ID, VALIDATION_SESSION_EPOCH } from '../data/demoData'
import { buildDisplayCatalog } from './catalog'
import { getRecordPerspectives, withPendingModelState } from './record'

function recordDiffers(current: ValidationRecord, baseline: ValidationRecord): boolean {
  return (
    current.state !== baseline.state ||
    current.includedInReport !== baseline.includedInReport ||
    current.wrong !== baseline.wrong ||
    JSON.stringify(current.curated) !== JSON.stringify(baseline.curated) ||
    current.decision?.decidedAt !== baseline.decision?.decidedAt
  )
}

export function buildSessionSnapshot(input: {
  records: ValidationRecord[]
  catalog: Catalog
  ui: ValidationSessionSnapshot['ui']
  published: boolean
  detailIndex: number
}): ValidationSessionSnapshot {
  const baseline = createDemoRecords()
  const baselineMap = new Map(baseline.map((record) => [record.personId, record]))
  const decisions: Record<string, ValidationDecisionDelta> = {}

  for (const record of input.records) {
    const base = baselineMap.get(record.personId)
    if (!base || !recordDiffers(record, base)) continue
    decisions[record.personId] = {
      state: record.state,
      curated: record.curated,
      includedInReport: record.includedInReport,
      wrong: record.wrong,
      decision: record.decision,
    }
  }

  return {
    schemaVersion: '1.0',
    eventId: EVENT_ID,
    sessionEpoch: VALIDATION_SESSION_EPOCH,
    catalog: structuredClone(input.catalog),
    decisions,
    ui: input.ui ? structuredClone(input.ui) : null,
    published: input.published,
    detailIndex: input.detailIndex,
    savedAt: new Date().toISOString(),
  }
}

function normalizeLoadedRecord(record: ValidationRecord): ValidationRecord {
  const perspectives = getRecordPerspectives(record)
  const spriteUrl = record.spriteUrl ?? (record.image.startsWith('/imgs/sprites/') ? record.image : undefined)
  const state = record.state === 'rejected' ? 'discarded' : record.state
  return {
    ...record,
    state,
    spriteUrl,
    image: spriteUrl ?? perspectives[0] ?? record.image,
    perspectives: spriteUrl ? [spriteUrl] : perspectives,
  }
}

export function applySessionSnapshot(snapshot: ValidationSessionSnapshot): {
  records: ValidationRecord[]
  catalog: Catalog
  published: boolean
  detailIndex: number
  ui: ValidationSessionSnapshot['ui']
} {
  const catalog = structuredClone(snapshot.catalog)
  const displayCatalog = buildDisplayCatalog(catalog)
  const demoRecords = createDemoRecords()

  const records = demoRecords.map((demo) => {
    const delta = snapshot.decisions[demo.personId]
    if (!delta) return demo
    return withPendingModelState(
      normalizeLoadedRecord({
        ...demo,
        state: delta.state,
        curated: delta.curated,
        includedInReport: delta.includedInReport,
        wrong: delta.wrong ?? demo.wrong,
        decision: delta.decision,
      }),
      displayCatalog,
    )
  })

  return {
    records,
    catalog,
    published: snapshot.published,
    detailIndex: snapshot.detailIndex,
    ui: snapshot.ui,
  }
}

export function isSnapshotCompatible(snapshot: ValidationSessionSnapshot): boolean {
  return snapshot.sessionEpoch === VALIDATION_SESSION_EPOCH && snapshot.eventId === EVENT_ID
}
