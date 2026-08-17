import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { useSpriteAnalysis } from '../hooks/useSpriteAnalysis'
import { spriteCropStyle } from '../utils/sprites'

interface SpriteCropProps {
  spriteUrl?: string
  image?: string
  slotIndex?: number
  className?: string
  style?: CSSProperties
  onSlotCount?: (count: number) => void
}

export function SpriteCrop({
  spriteUrl,
  image,
  slotIndex = 0,
  className = '',
  style,
  onSlotCount,
}: SpriteCropProps) {
  const source = spriteUrl ?? image ?? ''
  const isMosaic = className.includes('mosaic-crop')
  const { analysis, loading, error, containerRef } = useSpriteAnalysis(source, {
    lazy: isMosaic,
  })

  useEffect(() => {
    if (!onSlotCount) return
    onSlotCount(analysis?.activeSlots.length ?? 0)
  }, [analysis, onSlotCount])

  if (!source) {
    const empty = <div className={`sprite-crop empty ${className}`} />
    return isMosaic ? <div className="vtile-preview">{empty}</div> : empty
  }

  if (isMosaic) {
    if (loading) {
      return (
        <div className="vtile-preview" ref={containerRef}>
          <div className={`sprite-crop loading ${className}`} aria-label="Cargando recorte" />
        </div>
      )
    }

    if (error || !analysis) {
      return (
        <div className="vtile-preview" ref={containerRef}>
          <img src={source} alt="" className={className} style={style} />
        </div>
      )
    }

    const slot = analysis.activeSlots[Math.min(slotIndex, analysis.activeSlots.length - 1)]
    return (
      <div className="vtile-preview" ref={containerRef}>
        <div
          className={`sprite-crop ${className}`}
          style={{ ...spriteCropStyle(analysis, slot, 'mosaic'), ...style }}
          role="img"
          aria-label={`Perspectiva ${Math.min(slotIndex, analysis.activeSlots.length - 1) + 1} de ${analysis.activeSlots.length}`}
        />
      </div>
    )
  }

  if (loading) {
    return <div className={`sprite-crop loading ${className}`} aria-label="Cargando recorte" />
  }

  if (error || !analysis) {
    return <img src={source} alt="" className={className} style={style} />
  }

  const slot = analysis.activeSlots[Math.min(slotIndex, analysis.activeSlots.length - 1)]
  return (
    <div
      className={`sprite-crop ${className}`}
      style={{ ...spriteCropStyle(analysis, slot, 'detail'), ...style }}
      role="img"
      aria-label={`Perspectiva ${slotIndex + 1}`}
    />
  )
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
  const source = spriteUrl ?? image ?? ''
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
