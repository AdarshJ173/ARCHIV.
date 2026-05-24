import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { existsSync, unlinkSync, readFileSync } from 'fs'
import path from 'path'
import os from 'os'

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

// InnerTube Mobile client definitions
const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'
const INNERTUBE_API_URL = `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}&prettyPrint=false`
const INNERTUBE_CLIENT_VERSION = '20.10.38'
const INNERTUBE_CONTEXT = {
  client: {
    clientName: 'ANDROID',
    clientVersion: INNERTUBE_CLIENT_VERSION,
  },
}
const INNERTUBE_USER_AGENT = `com.google.android.youtube/${INNERTUBE_CLIENT_VERSION} (Linux; U; Android 14)`

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&micro;/g, 'µ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

function parseSrt(srt: string): { text: string; offset: number; duration: number }[] {
  const segments: { text: string; offset: number; duration: number }[] = []
  const blockRegex = /(\d+)\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\n([\s\S]*?)(?=\n\d+\n|\n*$)/g
  let m: RegExpExecArray | null
  while ((m = blockRegex.exec(srt.trim())) !== null) {
    const startParts = m[2].split(/[:,]/).map(Number)
    const endParts = m[3].split(/[:,]/).map(Number)
    const startMs = startParts[0] * 3600000 + startParts[1] * 60000 + startParts[2] * 1000 + startParts[3]
    const endMs = endParts[0] * 3600000 + endParts[1] * 60000 + endParts[2] * 1000 + endParts[3]
    const text = m[4].replace(/<[^>]+>/g, '').replace(/\n+/g, ' ').trim()
    if (text) segments.push({ text, offset: startMs, duration: endMs - startMs })
  }
  return segments
}

function ytDlpAvailable(): boolean {
  try {
    execSync('yt-dlp --version', { stdio: 'pipe', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

async function fetchViaYtDlp(videoId: string): Promise<{ text: string; offset: number; duration: number }[]> {
  const tmpDir = os.tmpdir()
  const srtPath = path.join(tmpDir, `${videoId}.en.srt`)

  if (existsSync(srtPath)) {
    try { unlinkSync(srtPath) } catch {}
  }

  execSync(
    `yt-dlp --skip-download --write-auto-subs --sub-langs en --convert-subs srt -o "${path.join(tmpDir, '%(id)s.%(ext)s')}" "https://www.youtube.com/watch?v=${videoId}"`,
    { stdio: 'pipe', timeout: 60000 }
  )

  if (!existsSync(srtPath)) throw new Error('No SRT produced by yt-dlp')
  const srt = readFileSync(srtPath, 'utf-8')
  try { unlinkSync(srtPath) } catch {}
  const segments = parseSrt(srt)
  if (segments.length === 0) throw new Error('No segments in SRT')
  return segments
}

async function fetchViaYoutubeTranscript(videoId: string): Promise<{ text: string; offset: number; duration: number }[]> {
  const { fetchTranscript } = await import('youtube-transcript')
  return fetchTranscript(videoId)
}

async function fetchFromYoutubetranscriptDotCom(videoId: string) {
  const res = await fetch(`https://youtubetranscript.com/?v=${videoId}`, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
      'Referer': 'https://www.youtube.com/',
    },
  })
  if (!res.ok) throw new Error(`youtubetranscript.com returned ${res.status}${res.status === 403 ? ' (blocked)' : ''}`)
  const body = await res.json()
  if (!Array.isArray(body) || body.length === 0) throw new Error('youtubetranscript.com returned no data')
  return body.map((seg: { text: string; start: number; duration: number }) => ({
    text: seg.text,
    offset: Math.round(seg.start * 1000),
    duration: Math.round(seg.duration * 1000),
  }))
}

async function fetchAndParseTranscriptXml(url: string): Promise<{ text: string; offset: number; duration: number }[]> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  if (!res.ok) throw new Error(`Transcript XML returned status ${res.status}`)
  const xml = await res.text()

  const segments: { text: string; offset: number; duration: number }[] = []

  // 1. Try classic standard XML format: <text start="s" dur="s">content</text>
  const classicRegex = /<text\s+start="([^"]+)"(?:\s+dur="([^"]+)")?[^>]*>([\s\S]*?)<\/text>/g
  let m: RegExpExecArray | null
  while ((m = classicRegex.exec(xml)) !== null) {
    const startSec = parseFloat(m[1])
    const durSec = m[2] ? parseFloat(m[2]) : 0.0
    const rawText = m[3]
    const text = decodeXmlEntities(rawText.replace(/<[^>]+>/g, '').trim())
    if (text) {
      segments.push({
        text,
        offset: Math.round(startSec * 1000),
        duration: Math.round(durSec * 1000),
      })
    }
  }

  // 2. Try srv3 XML format if classic yielded nothing: <p t="ms" d="ms"><s>word</s>...</p>
  if (segments.length === 0) {
    const pRegex = /<p\s+t="(\d+)"(?:\s+d="(\d+)")?[^>]*>([\s\S]*?)<\/p>/g
    while ((m = pRegex.exec(xml)) !== null) {
      const startMs = parseInt(m[1], 10)
      const durMs = m[2] ? parseInt(m[2], 10) : 0
      let rawText = m[3].replace(/<s[^>]*>([^<]*)<\/s>/g, '$1')
      rawText = rawText.replace(/<[^>]+>/g, '')
      const text = decodeXmlEntities(rawText.trim())
      if (text) {
        segments.push({
          text,
          offset: startMs,
          duration: durMs,
        })
      }
    }
  }

  if (segments.length === 0) {
    throw new Error('No transcript segments could be parsed from XML response')
  }

  return segments
}

async function fetchViaInnerTube(videoId: string): Promise<{ text: string; offset: number; duration: number }[]> {
  const res = await fetch(INNERTUBE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': INNERTUBE_USER_AGENT,
    },
    body: JSON.stringify({
      context: INNERTUBE_CONTEXT,
      videoId,
    }),
  })

  if (!res.ok) {
    throw new Error(`InnerTube API returned status ${res.status}`)
  }

  const data = await res.json()

  const playability = data?.playabilityStatus
  if (playability && playability.status !== 'OK' && playability.status !== 'UNPLAYABLE') {
    throw new Error(`InnerTube playability status: ${playability.status} (${playability.reason || 'No reason'})`)
  }

  const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks as
    Array<{ baseUrl: string; languageCode: string; name?: { simpleText: string }; kind?: string }> | undefined

  if (!captionTracks || captionTracks.length === 0) {
    throw new Error('No caption tracks available on this video')
  }

  // Priority-based language selection:
  // 1. English manually created (kind is undefined/empty)
  // 2. English auto-generated (kind is asr)
  // 3. Any other manually created subtitles
  // 4. Any subtitles
  const track = captionTracks.find(t => t.languageCode.startsWith('en') && !t.kind) ||
    captionTracks.find(t => t.languageCode.startsWith('en')) ||
    captionTracks.find(t => !t.kind) ||
    captionTracks[0]

  if (!track || !track.baseUrl) {
    throw new Error('Could not find a valid caption track URL')
  }

  return fetchAndParseTranscriptXml(track.baseUrl)
}

async function fetchViaVideoPage(videoId: string): Promise<{ text: string; offset: number; duration: number }[]> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  if (!res.ok) throw new Error(`YouTube watch page returned status ${res.status}`)
  const html = await res.text()

  if (html.includes('class="g-recaptcha"')) {
    throw new Error('YouTube watch page returned a CAPTCHA challenge (blocked)')
  }

  const startMarkers = [
    'window.ytInitialPlayerResponse=',
    'window["ytInitialPlayerResponse"]=',
    'var ytInitialPlayerResponse=',
    'ytInitialPlayerResponse = ',
  ]

  let playerResponse: any = null // eslint-disable-line @typescript-eslint/no-explicit-any

  for (const marker of startMarkers) {
    const idx = html.indexOf(marker)
    if (idx === -1) continue

    const start = idx + marker.length
    let codeStart = start
    while (codeStart < html.length && (html[codeStart] === ' ' || html[codeStart] === '\t' || html[codeStart] === '\n' || html[codeStart] === '\r')) {
      codeStart++
    }

    if (html[codeStart] !== '{') continue

    let depth = 0
    for (let i = codeStart; i < html.length; i++) {
      if (html[i] === '{') depth++
      else if (html[i] === '}') {
        depth--
        if (depth === 0) {
          const rawJson = html.slice(codeStart, i + 1)
          try {
            playerResponse = JSON.parse(rawJson)
            break
          } catch {
            // Keep looping to search other markers or parse depths
          }
        }
      }
    }
    if (playerResponse) break
  }

  if (!playerResponse) {
    throw new Error('Could not parse ytInitialPlayerResponse from watch page HTML')
  }

  const playability = playerResponse?.playabilityStatus
  if (playability && playability.status !== 'OK' && playability.status !== 'UNPLAYABLE') {
    throw new Error(`Video playability status: ${playability.status} (${playability.reason || 'No reason'})`)
  }

  const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks as
    Array<{ baseUrl: string; languageCode: string; name?: { simpleText: string }; kind?: string }> | undefined

  if (!captionTracks || captionTracks.length === 0) {
    throw new Error('No caption tracks available on this video')
  }

  // Priority-based language selection:
  // 1. English manually created (kind is undefined/empty)
  // 2. English auto-generated (kind is asr)
  // 3. Any other manually created subtitles
  // 4. Any subtitles
  const track = captionTracks.find(t => t.languageCode.startsWith('en') && !t.kind) ||
    captionTracks.find(t => t.languageCode.startsWith('en')) ||
    captionTracks.find(t => !t.kind) ||
    captionTracks[0]

  if (!track || !track.baseUrl) {
    throw new Error('Could not find a valid caption track URL')
  }

  return fetchAndParseTranscriptXml(track.baseUrl)
}

async function fetchFromTimedTextApi(videoId: string): Promise<{ text: string; offset: number; duration: number }[]> {
  const urls = [
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr&fmt=json3`,
  ]

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': 'https://www.youtube.com/',
        },
      })
      if (!res.ok) continue
      const jsonText = await res.text()
      if (!jsonText || jsonText === '{}') continue

      const data = JSON.parse(jsonText)
      if (data?.events?.length) {
        const segments: { text: string; offset: number; duration: number }[] = []
        for (const ev of data.events) {
          if (!ev.segs || ev.segs.length === 0) continue
          const text = ev.segs.map((s: { utf8?: string }) => s.utf8 || '').join('').trim()
          const decodedText = decodeXmlEntities(text)
          if (decodedText) {
            segments.push({
              text: decodedText,
              offset: ev.tStartMs || 0,
              duration: ev.dDurationMs || 0,
            })
          }
        }
        if (segments.length > 0) return segments
      }
    } catch {
      // Continue to next URL fallback
    }
  }
  throw new Error('Timedtext API probe returned no valid data')
}

function toSeconds(value: number | undefined): number {
  if (value === undefined) return 0
  return value > 500 ? value / 1000 : value
}

export async function POST(request: NextRequest) {
  try {
    const { videoId } = await request.json()
    if (!videoId || typeof videoId !== 'string') {
      return NextResponse.json({ success: false, error: 'Missing videoId' }, { status: 400 })
    }

    let segments: { text: string; offset: number; duration: number }[] | null = null
    const errors: string[] = []

    // 1. InnerTube Mobile Android API (Primary - highly robust, serverless safe, handles all languages, avoids exp=xpe block)
    try {
      segments = await fetchViaInnerTube(videoId)
    } catch (e) {
      errors.push(`innertube: ${e instanceof Error ? e.message : String(e)}`)
    }

    // 2. Bracket-depth watch page scraper fallback
    if (!segments) {
      try {
        segments = await fetchViaVideoPage(videoId)
      } catch (e) {
        errors.push(`watch-page: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    // 3. Timedtext API Direct JSON3 probe fallback
    if (!segments) {
      try {
        segments = await fetchFromTimedTextApi(videoId)
      } catch (e) {
        errors.push(`timedtext: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    // 4. youtube-transcript npm package fallback
    if (!segments) {
      try {
        segments = await fetchViaYoutubeTranscript(videoId)
      } catch (e) {
        errors.push(`youtube-transcript: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    // 5. Third-party youtubetranscript.com scraper fallback
    if (!segments) {
      try {
        segments = await fetchFromYoutubetranscriptDotCom(videoId)
      } catch (e) {
        errors.push(`youtubetranscript.com: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    // 6. Native yt-dlp fallback (only if installed on the host - e.g. local dev fallback)
    if (!segments && ytDlpAvailable()) {
      try {
        segments = await fetchViaYtDlp(videoId)
      } catch (e) {
        errors.push(`yt-dlp: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (!segments || segments.length === 0) {
      console.error(`Transcript failed for ${videoId}: ${errors.join('; ')}`)
      return NextResponse.json(
        { success: false, error: `No transcript available. Errors: ${errors.join('; ')}` },
        { status: 404 }
      )
    }

    const transcriptText = segments
      .map((seg) => {
        const t = toSeconds(seg.offset)
        const minutes = Math.floor(t / 60)
        const seconds = Math.floor(t % 60)
        return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}] ${seg.text}`
      })
      .join('\n')

    return NextResponse.json({
      success: true,
      data: {
        title: `YouTube Transcript - ${videoId}`,
        transcript: transcriptText,
        segments: segments.map((s) => ({
          text: s.text,
          start: toSeconds(s.offset),
          duration: toSeconds(s.duration),
        })),
        videoId,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('YouTube transcript API error:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
