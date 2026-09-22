import type { ValidationRecord, ValidationRun } from '../types'
import { normalizeBrandLabel, normalizeModelLabel, UNKNOWN_BRAND_LABEL, UNKNOWN_MODEL_LABEL } from '../utils/catalog'
import { HOMENAJE_ASSETS, type RaceAssets } from './raceAssets'
import { DEFAULT_EVENT_ID, getRace, raceValidationRun, type RaceDefinition } from './races'

export const EVENT_ID = DEFAULT_EVENT_ID
export const EVENT_TITLE = getRace(DEFAULT_EVENT_ID).eventTitle
export const VALIDATION_SESSION_EPOCH = getRace(DEFAULT_EVENT_ID).sessionEpoch
export const DEMO_TOTAL = HOMENAJE_ASSETS.spriteFiles.length
export const DEMO_RECORD_COUNT = DEMO_TOTAL
export const validationRun: ValidationRun = raceValidationRun(getRace(DEFAULT_EVENT_ID))

function personKeyFromFilename(filename: string): string {
  return filename.replace(/\.jpg$/i, '')
}

function sanitizeDetected(detected: { brand: string; model: string }) {
  return {
    brand: detected.brand.trim() || UNKNOWN_BRAND_LABEL,
    model: detected.model.trim() || UNKNOWN_MODEL_LABEL,
  }
}

export function createRecordsForRace(race: RaceDefinition, assets: RaceAssets): ValidationRecord[] {
  const records: ValidationRecord[] = []
  const spriteSample = assets.spriteFiles

  for (let i = 0; i < spriteSample.length; i += 1) {
    const filename = spriteSample[i]!
    const sprite = `${race.spritePrefix}/${filename}`
    const annotation = assets.annotations[personKeyFromFilename(filename)]
    const brand = annotation ? normalizeBrandLabel(annotation.brand) : UNKNOWN_BRAND_LABEL
    const model = annotation ? normalizeModelLabel(annotation.model) : UNKNOWN_MODEL_LABEL
    const confidence = typeof annotation?.score === 'number' && Number.isFinite(annotation.score)
      ? Number(annotation.score.toFixed(2))
      : 0
    const personNum = filename.match(/person_(\d+)/)?.[1] ?? String(i + 1).padStart(6, '0')

    records.push({
      personId: `P-${personNum}`,
      cropKey: `events/${race.eventId}/crops/person_${personNum}.jpg`,
      spriteUrl: sprite,
      image: sprite,
      perspectives: [sprite],
      state: 'pending',
      confidence,
      detected: sanitizeDetected({ brand, model }),
      curated: null,
      includedInReport: false,
      wrong: false,
      frames: '—',
      camera: `CAM-0${(i % 2) + 1}`,
      capturedAt: `${500 + i * 11}.${i % 9}s`,
    })
  }

  return records
}

export function createDemoRecords(): ValidationRecord[] {
  return createRecordsForRace(getRace(DEFAULT_EVENT_ID), HOMENAJE_ASSETS)
}
