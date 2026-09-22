import type { CSSProperties } from 'react'
import { authRequestHeaders } from '../auth/cognito'

export interface SpriteSlot {
  index: number
  x: number
  y: number
  w: number
  h: number
}

export interface SpriteAnalysis {
  url: string
  /** Blob local para CSS; evita re-fetch autenticado en background-image */
  renderUrl: string
  width: number
  height: number
  slots: SpriteSlot[]
  activeSlots: SpriteSlot[]
}

export type SpriteCropStyle = {
  backgroundImage: string
  backgroundSize: string
  backgroundPosition: string
  backgroundRepeat: 'no-repeat'
  width: string
  height: string
  maxWidth: string
}

const analysisCache = new Map<string, Promise<SpriteAnalysis>>()
const resolvedCache = new Map<string, SpriteAnalysis>()
const blobUrlCache = new Map<string, string>()

export function peekSpriteAnalysis(url: string): SpriteAnalysis | null {
  return resolvedCache.get(url) ?? null
}

export function clearSpriteAnalysisCache() {
  for (const blobUrl of blobUrlCache.values()) {
    URL.revokeObjectURL(blobUrl)
  }
  blobUrlCache.clear()
  analysisCache.clear()
  resolvedCache.clear()
}

/** Posiciones posibles según el tamaño del sprite (1–4 recortes). */
export function getLayoutSlots(width: number, height: number): SpriteSlot[] {
  if (width === 256) {
    if (height <= 256) {
      return [{ index: 0, x: 0, y: 0, w: 256, h: height }]
    }
    const cellH = height / 2
    return [
      { index: 0, x: 0, y: 0, w: 256, h: cellH },
      { index: 1, x: 0, y: cellH, w: 256, h: cellH },
    ]
  }

  if (width === 512) {
    const cellH = height / 2
    return [
      { index: 0, x: 0, y: 0, w: 256, h: cellH },
      { index: 1, x: 256, y: 0, w: 256, h: cellH },
      { index: 2, x: 0, y: cellH, w: 256, h: cellH },
      { index: 3, x: 256, y: cellH, w: 256, h: cellH },
    ]
  }

  return [{ index: 0, x: 0, y: 0, w: width, h: height }]
}

export function analyzeSpriteImage(
  image: HTMLImageElement,
  url: string,
  renderUrl: string,
): SpriteAnalysis {
  const width = image.naturalWidth
  const height = image.naturalHeight
  const slots = getLayoutSlots(width, height)
  return {
    url,
    renderUrl,
    width,
    height,
    slots,
    activeSlots: slots,
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('No se pudo decodificar imagen'))
    image.src = src
  })
}

export function loadSpriteAnalysis(url: string): Promise<SpriteAnalysis> {
  const cached = analysisCache.get(url)
  if (cached) return cached

  const promise = (async () => {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: authRequestHeaders(),
    })
    if (!response.ok) {
      throw new Error(`No se pudo cargar ${url} (${response.status})`)
    }
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    blobUrlCache.set(url, objectUrl)
    try {
      const image = await loadImageElement(objectUrl)
      if (image.naturalWidth === 0) await image.decode()
      const result = analyzeSpriteImage(image, url, objectUrl)
      resolvedCache.set(url, result)
      return result
    } catch (error) {
      URL.revokeObjectURL(objectUrl)
      blobUrlCache.delete(url)
      throw error
    }
  })().catch((error) => {
    analysisCache.delete(url)
    resolvedCache.delete(url)
    throw error
  })

  analysisCache.set(url, promise)
  return promise
}

export function getVisibleSlots(analysis: SpriteAnalysis, hiddenSlotIndexes?: number[]): SpriteSlot[] {
  const hidden = new Set(hiddenSlotIndexes ?? [])
  return analysis.activeSlots.filter((slot) => !hidden.has(slot.index))
}

export function spriteCropStyle(
  analysis: SpriteAnalysis,
  slot: SpriteSlot,
  _mode: 'detail' | 'mosaic' = 'detail',
): SpriteCropStyle {
  const src = analysis.renderUrl
  const scale = Math.min(460 / slot.w, 460 / slot.h)
  return {
    backgroundImage: `url("${src}")`,
    backgroundSize: `${analysis.width * scale}px ${analysis.height * scale}px`,
    backgroundPosition: `-${slot.x * scale}px -${slot.y * scale}px`,
    backgroundRepeat: 'no-repeat',
    width: `${slot.w * scale}px`,
    height: `${slot.h * scale}px`,
    maxWidth: '100%',
  }
}

const MOSAIC_CROP_PX = 96

export function mosaicSlotViewport(slot: SpriteSlot) {
  const scale = MOSAIC_CROP_PX / slot.h
  return {
    scale,
    width: slot.w * scale,
    height: MOSAIC_CROP_PX,
  }
}

export function mosaicSheetStyle(analysis: SpriteAnalysis, slot: SpriteSlot): CSSProperties {
  const { scale } = mosaicSlotViewport(slot)
  return {
    position: 'absolute',
    width: analysis.width * scale,
    height: analysis.height * scale,
    left: -slot.x * scale,
    top: -slot.y * scale,
    backgroundImage: `url("${analysis.renderUrl}")`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: '100% 100%',
  }
}

export function getSpriteSource(record: { spriteUrl?: string; image: string }): string {
  return record.spriteUrl ?? record.image
}
