import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { useSpriteAnalysis } from '../hooks/useSpriteAnalysis'
import { getVisibleSlots, mosaicSheetStyle, mosaicSlotViewport, spriteCropStyle } from '../utils/sprites'

interface SpriteCropProps {
  spriteUrl?: string
  image?: string
  slotIndex?: number
  hiddenSlotIndexes?: number[]
  className?: string
  style?: CSSProperties
  onSlotCount?: (count: number) => void
}

export function SpriteCrop({
  spriteUrl,
  image,
  slotIndex = 0,
  hiddenSlotIndexes,
  className = '',
  style,
  onSlotCount,
}: SpriteCropProps) {
  const source = spriteUrl ?? image ?? ''
  const isMosaic = className.includes('mosaic-crop')
  const { analysis, loading, error, containerRef } = useSpriteAnalysis(source, {
    lazy: false,
  })
  const visibleSlots = analysis ? getVisibleSlots(analysis, hiddenSlotIndexes) : []

  useEffect(() => {
    if (!onSlotCount) return
    onSlotCount(visibleSlots.length)
  }, [onSlotCount, visibleSlots.length])

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

    if (error || !analysis || visibleSlots.length === 0) {
      return (
        <div className="vtile-preview" ref={containerRef}>
          <img src={source} alt="" className={className} style={style} />
        </div>
      )
    }

    const slot = visibleSlots[Math.min(slotIndex, visibleSlots.length - 1)]!
    const viewport = mosaicSlotViewport(slot)
    return (
      <div className="vtile-preview" ref={containerRef}>
        <div
          className={`sprite-crop ${className}`}
          style={{
            width: viewport.width,
            height: viewport.height,
            overflow: 'hidden',
            position: 'relative',
            flexShrink: 0,
          }}
          role="img"
          aria-label={`Perspectiva ${Math.min(slotIndex, visibleSlots.length - 1) + 1} de ${visibleSlots.length}`}
        >
          <div style={mosaicSheetStyle(analysis, slot)} />
        </div>
      </div>
    )
  }

  if (loading) {
    return <div className={`sprite-crop loading ${className}`} aria-label="Cargando recorte" />
  }

  if (error || !analysis || visibleSlots.length === 0) {
    return <img src={source} alt="" className={className} style={style} />
  }

  const slot = visibleSlots[Math.min(slotIndex, visibleSlots.length - 1)]!
  return (
    <div
      className={`sprite-crop ${className}`}
      style={{ ...spriteCropStyle(analysis, slot, 'detail'), ...style }}
      role="img"
      aria-label={`Perspectiva ${slotIndex + 1}`}
    />
  )
}
