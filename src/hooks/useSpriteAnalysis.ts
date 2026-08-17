import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { SpriteAnalysis } from '../utils/sprites'
import { loadSpriteAnalysis, peekSpriteAnalysis } from '../utils/sprites'

interface UseSpriteAnalysisOptions {
  lazy?: boolean
  rootMargin?: string
}

export function useSpriteAnalysis(
  spriteUrl: string | undefined,
  options?: UseSpriteAnalysisOptions,
) {
  const lazy = options?.lazy ?? false
  const cached = spriteUrl ? peekSpriteAnalysis(spriteUrl) : null
  const [inView, setInView] = useState(!lazy || Boolean(cached))
  const containerRef = useRef<HTMLDivElement>(null)
  const [analysis, setAnalysis] = useState<SpriteAnalysis | null>(cached)
  const [loading, setLoading] = useState(Boolean(spriteUrl && !cached && !lazy))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!lazy) return
    if (analysis) return

    const element = containerRef.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: options?.rootMargin ?? '240px' },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [lazy, options?.rootMargin, analysis])

  useEffect(() => {
    if (!spriteUrl) {
      setAnalysis(null)
      setError(null)
      setLoading(false)
      return
    }

    const existing = peekSpriteAnalysis(spriteUrl)
    if (existing) {
      setAnalysis(existing)
      setError(null)
      setLoading(false)
      return
    }

    if (!inView) return

    let cancelled = false
    setLoading(true)
    setError(null)

    loadSpriteAnalysis(spriteUrl)
      .then((result) => {
        if (!cancelled) {
          setAnalysis(result)
          setLoading(false)
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setAnalysis(null)
          setError(err.message)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [spriteUrl, inView])

  return {
    analysis,
    loading: lazy && !inView && !analysis ? true : loading,
    error,
    containerRef: containerRef as RefObject<HTMLDivElement>,
  }
}
