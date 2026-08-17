import type { ValidationRecord, ValidationRun } from '../types'
import { normalizeBrandLabel, normalizeModelLabel, UNKNOWN_BRAND_LABEL, UNKNOWN_MODEL_LABEL } from '../utils/catalog'
import { SPRITE_ANNOTATIONS } from './spriteAnnotations'
import { DEMO_SPRITE_COUNT, SPRITE_FILES, spriteUrl } from './spriteManifest'

export const DEMO_TOTAL = DEMO_SPRITE_COUNT
export const DEMO_RECORD_COUNT = DEMO_SPRITE_COUNT

export const EVENT_ID = 'carrera-homenaje-fiestas-patria'
export const EVENT_TITLE = 'Carrera Homenaje Fiestas Patrias'
/** Incrementar al cambiar de experimento o forzar arranque en cero. */
export const VALIDATION_SESSION_EPOCH = '2026-08-04-images'

export const validationRun: ValidationRun = {
  schemaVersion: '1.0',
  eventId: EVENT_ID,
  runId: 'val-20260804T1800-b7f2',
  sourceRunId: 'carrera_homenaje_fiestas_patria_sam3_yoloworld-onnx_pose-onnx_clip-vit-l14_384',
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
    const brand = annotation ? normalizeBrandLabel(annotation.brand) : UNKNOWN_BRAND_LABEL
    const model = annotation ? normalizeModelLabel(annotation.model) : UNKNOWN_MODEL_LABEL
    const confidence = annotation ? Number(annotation.score.toFixed(2)) : 0
    const personNum = spriteSample[i].match(/person_(\d+)/)?.[1] ?? String(i + 1).padStart(6, '0')

    records.push({
      personId: `P-${personNum}`,
      cropKey: `events/${EVENT_ID}/crops/person_${personNum}.jpg`,
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
