import { useEffect, useState } from 'react'
import type { SpriteAnalysis } from '../utils/sprites'
import { loadSpriteAnalysis } from '../utils/sprites'

export function useSpriteAnalysis(spriteUrl: string | undefined) {
  const [analysis, setAnalysis] = useState<SpriteAnalysis | null>(null)
  const [loading, setLoading] = useState(Boolean(spriteUrl))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!spriteUrl) {
      setAnalysis(null)
      setLoading(false)
      setError(null)
      return
    }

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
  }, [spriteUrl])

  return { analysis, loading, error }
}
