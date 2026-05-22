'use client'

import { useState, useCallback, useRef } from 'react'
import type { YouTubeTranscriptResult, YouTubeChannelResult, VideoFetchInfo, VideoFetchStatus } from '@/types'

export function useYouTube() {
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [batchResults, setBatchResults] = useState<VideoFetchInfo[]>([])
  const [batchActive, setBatchActive] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const getTranscript = useCallback(async (videoId: string): Promise<YouTubeTranscriptResult | null> => {
    setFetching(true)
    setError(null)
    try {
      const res = await fetch('/api/youtube/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch transcript'
      setError(msg)
      return null
    } finally {
      setFetching(false)
    }
  }, [])

  const getChannelVideos = useCallback(async (channelUrl: string, apiKey: string): Promise<YouTubeChannelResult | null> => {
    setFetching(true)
    setError(null)
    try {
      const res = await fetch('/api/youtube/channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelUrl, apiKey }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      return json.data
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch channel'
      setError(msg)
      return null
    } finally {
      setFetching(false)
    }
  }, [])

  const cancelBatch = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setBatchActive(false)
  }, [])

  const fetchTranscriptsBatch = useCallback(async (
    videoIds: string[],
    options: {
      concurrency?: number
      maxRetries?: number
    } = {}
  ): Promise<VideoFetchInfo[]> => {
    const { concurrency = 3, maxRetries = 3 } = options

    abortRef.current = new AbortController()
    const signal = abortRef.current.signal
    setBatchActive(true)
    setBatchResults([])

    const results: VideoFetchInfo[] = videoIds.map(id => ({
      videoId: id,
      title: '',
      status: 'pending' as VideoFetchStatus,
    }))

    const total = videoIds.length
    let nextIndex = 0

    const worker = async () => {
      while (nextIndex < total && !signal.aborted) {
        const idx = nextIndex++
        if (idx >= total) break

        results[idx].status = 'fetching'
        setBatchResults([...results])

        // small delay between requests per worker to avoid rate limiting
        await new Promise(r => setTimeout(r, 800))

        let lastError: string | undefined
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const res = await fetch('/api/youtube/transcript', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ videoId: videoIds[idx] }),
              signal,
            })
            const json = await res.json()
            if (!json.success) {
              const errMsg = json.error.toLowerCase()
              if (
                errMsg.includes('no captions') ||
                errMsg.includes('transcript') ||
                errMsg.includes('disabled') ||
                errMsg.includes('subtitles')
              ) {
                results[idx].status = 'no-captions'
                results[idx].error = json.error
                break
              }
              throw new Error(json.error)
            }
            results[idx].status = 'done'
            results[idx].result = json.data
            results[idx].title = json.data.title
            break
          } catch (err) {
            if (signal.aborted) break
            if (err instanceof DOMException && err.name === 'AbortError') break
            lastError = err instanceof Error ? err.message : 'Unknown error'
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(3, attempt - 1)))
            }
          }
        }

        if (!signal.aborted && results[idx].status === 'fetching') {
          results[idx].status = 'failed'
          results[idx].error = lastError
        }

        setBatchResults([...results])
      }
    }

    const workerCount = Math.min(concurrency, total)
    const workers = Array.from({ length: workerCount }, () => worker())
    await Promise.all(workers)

    setBatchActive(false)
    abortRef.current = null
    return results
  }, [])

  return {
    getTranscript,
    getChannelVideos,
    fetchTranscriptsBatch,
    cancelBatch,
    fetching,
    error,
    batchResults,
    batchActive,
  }
}
