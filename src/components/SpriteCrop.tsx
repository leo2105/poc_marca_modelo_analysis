import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { useSpriteAnalysis } from '../hooks/useSpriteAnalysis'
import { getSpriteSource, spriteCropStyle } from '../utils/sprites'

interface SpriteCropProps {
  spriteUrl?: string
  image?: string
  slotIndex?: number
  className?: string
  style?: CSSProperties
}

export function SpriteCrop({
  spriteUrl,
  image,
  slotIndex = 0,
  className = '',
  style,
}: SpriteCropProps) {
  const source = spriteUrl ?? image ?? ''
  const isMosaic = className.includes('mosaic-crop')
  const { analysis, loading, error } = useSpriteAnalysis(source)

  if (!source) {
    const empty = <div className={`sprite-crop empty ${className}`} />
    return isMosaic ? <div className="vtile-preview">{empty}</div> : empty
  }

  if (loading) {
    const loadingEl = <div className={`sprite-crop loading ${className}`} aria-label="Cargando recorte" />
    return isMosaic ? <div className="vtile-preview">{loadingEl}</div> : loadingEl
  }

  if (error || !analysis) {
    return isMosaic ? (
      <div className="vtile-preview"><img src={source} alt="" className={className} style={style} /></div>
    ) : (
      <img src={source} alt="" className={className} style={style} />
    )
  }

  const slot = analysis.activeSlots[Math.min(slotIndex, analysis.activeSlots.length - 1)]
  const crop = (
    <div
      className={`sprite-crop ${className}`}
      style={{ ...spriteCropStyle(analysis, slot, isMosaic ? 'mosaic' : 'detail'), ...style }}
      role="img"
      aria-label={`Perspectiva ${slotIndex + 1}`}
    />
  )

  if (isMosaic) {
    return <div className="vtile-preview">{crop}</div>
  }

  return crop
}

interface SpritePerspectivesProps {
  spriteUrl?: string
  image?: string
  perspectiveIndex: number
  onPerspectiveCount?: (count: number) => void
}

export function SpritePerspectives({
  spriteUrl,
  image,
  perspectiveIndex,
  onPerspectiveCount,
}: SpritePerspectivesProps) {
  const source = getSpriteSource({ spriteUrl, image: image ?? '' })
  const { analysis, loading, error } = useSpriteAnalysis(source)
  const activeCount = analysis?.activeSlots.length ?? 0

  useEffect(() => {
    if (activeCount > 0) onPerspectiveCount?.(activeCount)
  }, [activeCount, onPerspectiveCount])

  if (!source) return null

  if (loading) {
    return <div className="sprite-crop loading detail-sprite" aria-label="Cargando perspectivas" />
  }

  if (error || !analysis) {
    return <img src={source} alt="" className="detail-sprite-fallback" />
  }

  const slot = analysis.activeSlots[Math.min(perspectiveIndex, analysis.activeSlots.length - 1)]
  return (
    <div
      className="sprite-crop detail-sprite"
      style={spriteCropStyle(analysis, slot)}
      role="img"
      aria-label={`Perspectiva ${perspectiveIndex + 1} de ${analysis.activeSlots.length}`}
    />
  )
}
