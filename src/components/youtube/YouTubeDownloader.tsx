'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useYouTube } from '@/hooks/useYouTube'
import { useSettings } from '@/hooks/useSettings'
import type { YouTubeTranscriptResult, YouTubeChannelVideo, VideoFetchInfo } from '@/types'
import {
  Download, Search, Loader2, AlertCircle, XCircle, CheckCircle2,
  Ban, Clock, FileDown, Film, MessageSquare,
  ListVideo, ChevronDown, ChevronRight,
} from 'lucide-react'

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

function isChannelUrl(url: string): boolean {
  return /youtube\.com\/(@|channel\/UC|c\/|user\/)/.test(url)
}

function getUrlType(url: string): 'video' | 'channel' | null {
  if (!url.trim()) return null
  if (isChannelUrl(url)) return 'channel'
  if (extractVideoId(url)) return 'video'
  return null
}

const statusBadge = (status: VideoFetchInfo['status']) => {
  switch (status) {
    case 'pending':
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', padding: '2px 8px', borderRadius: '999px', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}><Clock className="h-3 w-3" />Pending</span>
    case 'fetching':
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}><Loader2 className="h-3 w-3 animate-spin" />Fetching</span>
    case 'done':
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(45, 107, 63, 0.1)', color: 'var(--success)' }}><CheckCircle2 className="h-3 w-3" />Done</span>
    case 'failed':
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(155, 44, 44, 0.1)', color: 'var(--error)' }}><XCircle className="h-3 w-3" />Failed</span>
    case 'no-captions':
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(154, 123, 47, 0.1)', color: 'var(--warning)' }}><Ban className="h-3 w-3" />No CC</span>
  }
}

export default function YouTubeDownloader() {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<'idle' | 'single' | 'channel'>('idle')
  const [singleResult, setSingleResult] = useState<YouTubeTranscriptResult | null>(null)
  const [channelVideos, setChannelVideos] = useState<YouTubeChannelVideo[]>([])
  const [channelName, setChannelName] = useState('')
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set())
  const [fetchStatuses, setFetchStatuses] = useState<Record<string, VideoFetchInfo>>({})
  const [batchStartTime, setBatchStartTime] = useState(0)
  const [batchComplete, setBatchComplete] = useState(false)
  const [showTranscripts, setShowTranscripts] = useState(true)
  const [eta, setEta] = useState<string | null>(null)
  const { getTranscript, getChannelVideos: fetchChannel, fetchTranscriptsBatch, cancelBatch, fetching, error, batchActive } = useYouTube()
  const { settings } = useSettings()

  const urlType = getUrlType(url)

  const handleSubmit = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    if (isChannelUrl(trimmed)) {
      setMode('channel')
      setSingleResult(null)
      setFetchStatuses({})
      setBatchComplete(false)
      const result = await fetchChannel(trimmed, settings.youtubeDataKey)
      if (result) {
        setChannelName(result.channelName)
        setChannelVideos(result.videos)
        setSelectedVideos(new Set(result.videos.slice(0, 10).map(v => v.id)))
      }
    } else {
      const videoId = extractVideoId(trimmed)
      if (!videoId) return
      setMode('single')
      setChannelVideos([])
      setFetchStatuses({})
      setBatchComplete(false)
      const result = await getTranscript(videoId)
      if (result) setSingleResult(result)
    }
  }

  const downloadTranscript = (result: YouTubeTranscriptResult) => {
    const title = result.title.replace(/[^a-zA-Z0-9_-\s]/g, '').slice(0, 100)
    const filename = `${title}.txt`
    const header = `Title: ${result.title}\nURL: https://youtube.com/watch?v=${result.videoId}\n\n`
    const content = header + result.transcript
    const blob = new Blob([content], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const getDownloadableResults = useCallback(() => {
    return Object.values(fetchStatuses).filter(r => r.status === 'done' && r.result)
  }, [fetchStatuses])

  const downloadAllFetched = useCallback(async () => {
    const fetched = getDownloadableResults()
    if (fetched.length === 0) return
    if (fetched.length === 1 && fetched[0].result) {
      downloadTranscript(fetched[0].result)
      return
    }
    const zip = await import('jszip')
    const jszip = new zip.default()
    for (const f of fetched) {
      if (!f.result) continue
      const header = `Title: ${f.result.title}\nURL: https://youtube.com/watch?v=${f.videoId}\n\n`
      const filename = `${f.title.replace(/[^a-zA-Z0-9_-\s]/g, '').slice(0, 80)}.txt`
      jszip.file(filename, header + f.result.transcript)
    }
    const blob = await jszip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${channelName.replace(/[^a-zA-Z0-9_-\s]/g, '')}_transcripts.zip`
    a.click()
    URL.revokeObjectURL(a.href)
  }, [getDownloadableResults, channelName])

  const startBatchFetch = async () => {
    const selected = channelVideos.filter(v => selectedVideos.has(v.id))
    if (selected.length === 0) return
    setBatchComplete(false)
    setBatchStartTime(Date.now())
    setFetchStatuses({})
    await fetchTranscriptsBatch(selected.map(v => v.id), { concurrency: 10, maxRetries: 3 })
    setBatchComplete(true)
  }

  const toggleVideo = (id: string) => {
    if (batchActive) return
    setSelectedVideos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllVideos = () => {
    if (batchActive) return
    setSelectedVideos(new Set(channelVideos.map(v => v.id)))
  }
  const deselectAllVideos = () => {
    if (batchActive) return
    setSelectedVideos(new Set())
  }

  const doneCount = useMemo(() => Object.values(fetchStatuses).filter(r => r.status === 'done').length, [fetchStatuses])
  const fetchingCount = useMemo(() => Object.values(fetchStatuses).filter(r => r.status === 'fetching').length, [fetchStatuses])
  const failedCount = useMemo(() => Object.values(fetchStatuses).filter(r => r.status === 'failed').length, [fetchStatuses])
  const noCaptionsCount = useMemo(() => Object.values(fetchStatuses).filter(r => r.status === 'no-captions').length, [fetchStatuses])
  const totalSelected = selectedVideos.size
  const completedCount = doneCount + failedCount + noCaptionsCount
  const pendingCount = Math.max(0, totalSelected - Object.keys(fetchStatuses).length)

  useEffect(() => {
    if (!batchActive) {
      const t = setTimeout(() => setEta(null), 0)
      return () => clearTimeout(t)
    }
    const tick = () => {
      if (completedCount === 0) { setEta(null); return }
      const remaining = totalSelected - completedCount
      if (remaining <= 0) { setEta(null); return }
      const elapsed = Date.now() - batchStartTime
      const avgPerItem = elapsed / completedCount
      const remainingMs = avgPerItem * remaining
      setEta(remainingMs < 60000 ? '<1m' : `~${Math.ceil(remainingMs / 60000)}m`)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [batchActive, batchStartTime, completedCount, totalSelected])

  const progressPercent = useMemo(() => {
    if (totalSelected === 0) return 0
    return Math.round((completedCount / totalSelected) * 100)
  }, [completedCount, totalSelected])

  return (
    <>
      <div className="panel-section">
        <div className="panel-section-title">Source URL</div>
        <div className="url-input-group">
          <div className="url-input-wrapper">
            <input
              className="url-input"
              placeholder="Paste YouTube video or channel URL..."
              value={url}
              onChange={(e) => { setUrl(e.target.value); setMode('idle'); setSingleResult(null); setChannelVideos([]) }}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
            {urlType && url.trim() && (
              <span className="detect-badge">
                <Film className="h-3 w-3 inline" style={{ marginRight: '3px' }} />
                {urlType === 'channel' ? 'Channel' : 'Video'}
              </span>
            )}
          </div>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={fetching || !url.trim()}>
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Fetch
          </button>
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--error)', padding: '8px 12px', background: 'rgba(155, 44, 44, 0.08)', borderRadius: '4px', marginBottom: '16px' }}>
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {mode === 'single' && singleResult && (
        <div className="panel-section">
          <div className="panel-section-title">Transcript</div>
          <div className="video-preview">
            <img
              className="video-thumbnail"
              src={`https://img.youtube.com/vi/${singleResult.videoId}/mqdefault.jpg`}
              alt={singleResult.title}
            />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--foreground)', lineHeight: '1.3' }}>
                {singleResult.title}
              </div>
              <div className="video-stats">
                <span className="stat-badge">
                  <MessageSquare className="h-3 w-3 inline" style={{ marginRight: '3px' }} />
                  {singleResult.segments.length} segments
                </span>
                <span className="stat-badge">
                  <Clock className="h-3 w-3 inline" style={{ marginRight: '3px' }} />
                  {Math.floor(singleResult.segments.reduce((a, s) => a + s.duration, 0) / 60)} min
                </span>
              </div>
              <div style={{ marginTop: '8px' }}>
                <button className="btn btn-accent btn-sm" onClick={() => downloadTranscript(singleResult)}>
                  <Download className="h-3.5 w-3.5" />
                  Download .txt
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '12px' }}>
            <button
              onClick={() => setShowTranscripts(!showTranscripts)}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 500, color: 'var(--muted-foreground)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', width: '100%', textAlign: 'left', fontFamily: 'var(--font-body)' }}
            >
              {showTranscripts ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Transcript Preview ({singleResult.segments.length} lines)
            </button>
            {showTranscripts && (
              <div style={{ marginTop: '4px', maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px', padding: '8px 12px', background: 'var(--background)' }}>
                {singleResult.segments.slice(0, 50).map((s, i) => (
                  <div key={i} className="transcript-line">
                    <span className="transcript-time">
                      [{Math.floor(s.start / 60)}:{String(Math.floor(s.start % 60)).padStart(2, '0')}]
                    </span>
                    {s.text}
                  </div>
                ))}
                {singleResult.segments.length > 50 && (
                  <div className="transcript-more">... {singleResult.segments.length - 50} more segments</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {mode === 'channel' && channelVideos.length > 0 && (
        <div className="panel-section">
          <div className="panel-section-title">{channelName}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginBottom: '12px' }}>
            {channelVideos.length} videos on channel &middot; {totalSelected} selected
          </div>

          {(batchActive || batchComplete) && (
            <div className="stage-list" style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--success)' }}><CheckCircle2 className="h-3.5 w-3.5" />{doneCount} done</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--error)' }}><XCircle className="h-3.5 w-3.5" />{failedCount} fail</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--warning)' }}><Ban className="h-3.5 w-3.5" />{noCaptionsCount} no CC</span>
                  {batchActive && fetchingCount > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#3b82f6' }}><Loader2 className="h-3.5 w-3.5 animate-spin" />{fetchingCount} active</span>}
                  {pendingCount > 0 && <span style={{ color: 'var(--muted-foreground)' }}>{pendingCount} queued</span>}
                  {eta && batchActive && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted-foreground)' }}>ETA: {eta}</span>}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {batchActive ? (
                    <button className="btn btn-secondary btn-sm" onClick={cancelBatch}>
                      Cancel
                    </button>
                  ) : getDownloadableResults().length > 0 ? (
                    <button className="btn btn-accent btn-sm" onClick={downloadAllFetched}>
                      <FileDown className="h-3.5 w-3.5" />
                      Download All ({getDownloadableResults().length})
                    </button>
                  ) : null}
                </div>
              </div>
              {batchActive && (
                <div className="progress-bar">
                  <div className="progress-fill accent" style={{ width: `${progressPercent}%` }} />
                </div>
              )}
              {batchComplete && (
                <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
                  Fetched {doneCount}/{totalSelected} transcripts
                  {failedCount > 0 && ` (${failedCount} failed)`}
                  {noCaptionsCount > 0 && ` (${noCaptionsCount} without captions)`}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <button className="btn btn-ghost btn-sm" onClick={selectAllVideos} disabled={batchActive}>Select All</button>
            <button className="btn btn-ghost btn-sm" onClick={deselectAllVideos} disabled={batchActive}>Deselect</button>
            <div style={{ flex: 1 }} />
            <button
              className="btn btn-accent btn-sm"
              onClick={startBatchFetch}
              disabled={batchActive || totalSelected === 0}
            >
              {batchActive ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Fetching {completedCount}/{totalSelected}</>
              ) : (
                <><ListVideo className="h-3.5 w-3.5" />Fetch {totalSelected}</>
              )}
            </button>
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: '4px', maxHeight: '400px', overflowY: 'auto' }}>
            {channelVideos.map((v) => {
              const fetchInfo = fetchStatuses[v.id]
              const hasStatus = !!fetchInfo
              return (
                <div key={v.id} className="video-row" onClick={() => toggleVideo(v.id)}>
                  <input
                    type="checkbox"
                    checked={selectedVideos.has(v.id)}
                    disabled={batchActive}
                    onChange={() => {}}
                    className="video-row-checkbox"
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="video-row-title" style={fetchInfo?.status === 'failed' ? { color: 'var(--error)' } : {}}>
                      {v.title}
                    </div>
                    <div className="video-row-date">
                      {new Date(v.publishedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {hasStatus ? statusBadge(fetchInfo.status) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {mode === 'idle' && (
        <div className="empty-state" style={{ flex: 1 }}>
          <Film className="empty-icon" />
          <div className="empty-text">Enter a YouTube URL above</div>
          <div className="empty-hint">Supports video links and channel URLs</div>
        </div>
      )}
    </>
  )
}
