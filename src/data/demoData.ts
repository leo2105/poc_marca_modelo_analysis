import type { ValidationRecord, ValidationRun } from '../types'
import { catalogKeyToLabel, modelKeyToLabel, normalizeBrandLabel, normalizeModelLabel, UNKNOWN_BRAND_LABEL, UNKNOWN_MODEL_LABEL } from '../utils/catalog'
import { SPRITE_ANNOTATIONS } from './spriteAnnotations'
import { DEMO_SPRITE_COUNT, SPRITE_FILES, spriteUrl } from './spriteManifest'

export const DEMO_TOTAL = DEMO_SPRITE_COUNT
export const DEMO_RECORD_COUNT = DEMO_SPRITE_COUNT

export const validationRun: ValidationRun = {
  schemaVersion: '1.0',
  eventId: 'nb15k-2026',
  runId: 'val-20260318T1540-a91c',
  sourceRunId: '20260316T0210-m3a7f',
  catalogVersion: 'catalog-2026.03',
  published: false,
  actor: 'ops:leon',
}

function personKeyFromFilename(filename: string): string {
  return filename.replace(/\.jpg$/i, '')
}

function getAnnotation(filename: string) {
  return SPRITE_ANNOTATIONS[personKeyFromFilename(filename)]
}

function sanitizeDetected(detected: { brand: string; model: string }) {
  return {
    brand: detected.brand.trim() || UNKNOWN_BRAND_LABEL,
    model: detected.model.trim() || UNKNOWN_MODEL_LABEL,
  }
}

export function createDemoRecords(): ValidationRecord[] {
  const records: ValidationRecord[] = []
  const spriteSample = SPRITE_FILES.slice(0, DEMO_RECORD_COUNT)

  for (let i = 0; i < spriteSample.length; i += 1) {
    const sprite = spriteUrl(spriteSample[i])
    const annotation = getAnnotation(spriteSample[i])
    const brand = annotation ? normalizeBrandLabel(annotation.brand) : 'Nike'
    const model = annotation ? normalizeModelLabel(annotation.model) : 'Pegasus'
    const confidence = annotation ? Number(annotation.score.toFixed(2)) : 0.5
    const wrong = confidence < 0.5

    let state: ValidationRecord['state'] = 'pending'
    if (!wrong) {
      const remainder = i % 5
      if (remainder === 0 || remainder === 1) state = 'approved'
      else if (remainder === 2) state = 'corrected'
      else if (i % 11 === 7) state = 'discarded'
    }

    const curated =
      state === 'approved' || state === 'corrected'
        ? { brand, model }
        : null

    const personNum = spriteSample[i].match(/person_(\d+)/)?.[1] ?? String(i + 2).padStart(6, '0')

    records.push({
      personId: `P-${personNum}`,
      cropKey: `events/nb15k-2026/crops/person_${personNum}.jpg`,
      spriteUrl: sprite,
      image: sprite,
      perspectives: [sprite],
      state,
      confidence,
      detected: sanitizeDetected({ brand, model }),
      curated,
      includedInReport: state === 'approved' || state === 'corrected',
      wrong,
      frames: ['5/5', '4/5', '3/5'][i % 3],
      camera: `CAM-0${(i % 2) + 1}`,
      capturedAt: `${500 + i * 11}.${i % 9}s`,
    })
  }

  return records
}

export function seedCatalogLabels() {
  return {
    Adidas: ['Adizero', 'Ultraboost', 'Supernova'],
    Nike: ['Pegasus', 'Vaporfly', 'Alphafly'],
    Asics: ['Gel Nimbus', 'Gel Kayano', 'Novablast'],
    'New Balance': ['1080', 'Fuelcell Rebel', 'More'],
    Puma: ['Deviate Nitro', 'Velocity Nitro'],
    Hoka: ['Clifton', 'Mach', 'Rocket X'],
    ...Object.fromEntries(
      ['Brooks', 'Saucony', 'On'].map((brand) => [brand, [`${brand} Model`]]),
    ),
  }
}

export function catalogFromJson(catalog: Record<string, string[]>) {
  const display: Record<string, string[]> = {}
  for (const [brandKey, models] of Object.entries(catalog)) {
    display[catalogKeyToLabel(brandKey)] = models.map(modelKeyToLabel)
  }
  return display
}
