import type { ValidationDecisionDelta, ValidationRecord, ValidationSessionSnapshot } from '../types'
import type { Catalog } from '../types'
import { createDemoRecords } from '../data/demoData'
import type { RaceDefinition } from '../data/races'
import { buildDisplayCatalog } from './catalog'
import { getRecordPerspectives, withPendingModelState } from './record'

function recordDiffers(current: ValidationRecord, baseline: ValidationRecord): boolean {
  return (
    current.state !== baseline.state ||
    current.includedInReport !== baseline.includedInReport ||
    current.wrong !== baseline.wrong ||
    current.hiddenFromView !== baseline.hiddenFromView ||
    JSON.stringify(current.hiddenSlotIndexes ?? []) !== JSON.stringify(baseline.hiddenSlotIndexes ?? []) ||
    JSON.stringify(current.curated) !== JSON.stringify(baseline.curated) ||
    current.decision?.decidedAt !== baseline.decision?.decidedAt
  )
}

function isSpritePath(url: string) {
  return url.includes('/imgs/sprites/') || /\/imgs\/races\/[^/]+\/sprites\//.test(url)
}

export function buildSessionSnapshot(input: {
  records: ValidationRecord[]
  catalog: Catalog
  ui: ValidationSessionSnapshot['ui']
  published: boolean
  detailIndex: number
  race: RaceDefinition
  baseline?: ValidationRecord[]
}): ValidationSessionSnapshot {
  const baseline = input.baseline ?? createDemoRecords()
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
      hiddenSlotIndexes: record.hiddenSlotIndexes,
      hiddenFromView: record.hiddenFromView,
      decision: record.decision,
    }
  }

  return {
    schemaVersion: '1.0',
    eventId: input.race.eventId,
    sessionEpoch: input.race.sessionEpoch,
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
  const spriteUrl = record.spriteUrl ?? (isSpritePath(record.image) ? record.image : undefined)
  const state = record.state === 'rejected' ? 'discarded' : record.state
  return {
    ...record,
    state,
    spriteUrl,
    image: spriteUrl ?? perspectives[0] ?? record.image,
    perspectives: spriteUrl ? [spriteUrl] : perspectives,
  }
}

export function applySessionSnapshot(
  snapshot: ValidationSessionSnapshot,
  baseline: ValidationRecord[] = createDemoRecords(),
): {
  records: ValidationRecord[]
  catalog: Catalog
  published: boolean
  detailIndex: number
  ui: ValidationSessionSnapshot['ui']
} {
  const catalog = structuredClone(snapshot.catalog)
  const displayCatalog = buildDisplayCatalog(catalog)

  const records = baseline.map((demo) => {
    const delta = snapshot.decisions[demo.personId]
    if (!delta) return demo
    return withPendingModelState(
      normalizeLoadedRecord({
        ...demo,
        state: delta.state,
        curated: delta.curated,
        includedInReport: delta.includedInReport,
        wrong: delta.wrong ?? demo.wrong,
        hiddenSlotIndexes: delta.hiddenSlotIndexes,
        hiddenFromView: delta.hiddenFromView,
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

export function isSnapshotCompatible(snapshot: ValidationSessionSnapshot, race: RaceDefinition): boolean {
  return snapshot.sessionEpoch === race.sessionEpoch && snapshot.eventId === race.eventId
}
