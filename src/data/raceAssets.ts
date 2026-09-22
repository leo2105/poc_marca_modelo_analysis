import type { SpriteAnnotation } from './spriteAnnotations'
import { SPRITE_ANNOTATIONS } from './spriteAnnotations'
import { SPRITE_FILES } from './spriteManifest'
import { DEFAULT_EVENT_ID } from './races'

export interface RaceAssets {
  spriteFiles: readonly string[]
  annotations: Record<string, SpriteAnnotation>
}

interface GeneratedRaceFile {
  eventId: string
  spriteFiles: string[]
  annotations: Record<string, SpriteAnnotation>
}

const generatedModules = import.meta.glob('./generated/*.json')

export const HOMENAJE_ASSETS: RaceAssets = {
  spriteFiles: SPRITE_FILES,
  annotations: SPRITE_ANNOTATIONS,
}

export function isHomenajeEvent(eventId: string) {
  return eventId === DEFAULT_EVENT_ID
}

export async function loadRaceAssets(eventId: string): Promise<RaceAssets> {
  if (isHomenajeEvent(eventId)) return HOMENAJE_ASSETS

  const loader = generatedModules[`./generated/${eventId}.json`]
  if (!loader) {
    throw new Error(`No hay dataset generado para ${eventId}`)
  }

  const mod = (await loader()) as { default?: GeneratedRaceFile } & Partial<GeneratedRaceFile>
  const data = mod.default ?? (mod as GeneratedRaceFile)
  if (!Array.isArray(data.spriteFiles)) {
    throw new Error(`Dataset inválido para ${eventId}`)
  }
  return {
    spriteFiles: data.spriteFiles,
    annotations: data.annotations,
  }
}
