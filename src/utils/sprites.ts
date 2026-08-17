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

function isBlankRegion(data: Uint8ClampedArray, width: number, slot: SpriteSlot): boolean {
  const { x, y, w, h } = slot
  let sumR = 0
  let sumG = 0
  let sumB = 0
  let count = 0
  const stepX = Math.max(1, Math.floor(w / 24))
  const stepY = Math.max(1, Math.floor(h / 24))

  for (let py = y; py < y + h; py += stepY) {
    for (let px = x; px < x + w; px += stepX) {
      const i = (py * width + px) * 4
      sumR += data[i]
      sumG += data[i + 1]
      sumB += data[i + 2]
      count += 1
    }
  }

  const avgR = sumR / count
  const avgG = sumG / count
  const avgB = sumB / count
  let variance = 0
  for (let py = y; py < y + h; py += stepY) {
    for (let px = x; px < x + w; px += stepX) {
      const i = (py * width + px) * 4
      variance += (data[i] - avgR) ** 2 + (data[i + 1] - avgG) ** 2 + (data[i + 2] - avgB) ** 2
    }
  }
  variance /= count

  const minAvg = Math.min(avgR, avgG, avgB)
  return minAvg > 240 && variance < 800
}

export function analyzeSpriteImage(
  image: HTMLImageElement,
  url: string,
  renderUrl: string,
): SpriteAnalysis {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('No se pudo analizar el sprite')
  }
  ctx.drawImage(image, 0, 0)
  const { width, height, data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const slots = getLayoutSlots(width, height)
  const activeSlots = slots.filter((slot) => !isBlankRegion(data, width, slot))
  return {
    url,
    renderUrl,
    width,
    height,
    slots,
    activeSlots: activeSlots.length > 0 ? activeSlots : slots.slice(0, 1),
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

export function spriteCropStyle(
  analysis: SpriteAnalysis,
  slot: SpriteSlot,
  mode: 'detail' | 'mosaic' = 'detail',
): SpriteCropStyle {
  if (mode === 'mosaic') {
    const targetHeight = 112
    const scale = targetHeight / slot.h
    const cellW = slot.w * scale
    const src = analysis.renderUrl
    return {
      backgroundImage: `url("${src}")`,
      backgroundSize: `${analysis.width * scale}px ${analysis.height * scale}px`,
      backgroundPosition: `-${slot.x * scale}px -${slot.y * scale}px`,
      backgroundRepeat: 'no-repeat',
      width: `${cellW}px`,
      height: `${targetHeight}px`,
      maxWidth: 'none',
    }
  }

  const scale = Math.min(460 / slot.w, 460 / slot.h)
  const src = analysis.renderUrl
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

export function getSpriteSource(record: { spriteUrl?: string; image: string }): string {
  return record.spriteUrl ?? record.image
}
