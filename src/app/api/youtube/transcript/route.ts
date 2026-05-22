import { NextRequest, NextResponse } from 'next/server'

async function fetchFromYoutubeTranscript(videoId: string) {
  const { fetchTranscript } = await import('youtube-transcript')
  return fetchTranscript(videoId)
}

async function fetchFromThirdParty(videoId: string) {
  const res = await fetch(`https://youtubetranscript.com/?v=${videoId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!res.ok) throw new Error(`Third-party API returned ${res.status}`)
  const body = await res.json()
  if (!Array.isArray(body)) throw new Error('Third-party API returned unexpected data')
  return body.map((seg: { text: string; start: number; duration: number }) => ({
    text: seg.text,
    offset: seg.start * 1000,
    duration: seg.duration * 1000,
    lang: 'en',
  }))
}

function toSeconds(value: number | undefined): number {
  if (value === undefined) return 0
  // youtube-transcript may return offset in milliseconds (srv3, e.g., 14320)
  // or seconds (classic format, e.g., 14.32). Values > 500 are likely ms.
  return value > 500 ? value / 1000 : value
}

function segmentsToTranscript(
  segments: { text: string; offset?: number; start?: number; duration?: number }[]
) {
  const transcript = segments
    .map((seg) => {
      const t = toSeconds(seg.offset ?? seg.start)
      const minutes = Math.floor(t / 60)
      const seconds = Math.floor(t % 60)
      const timestamp = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}]`
      return `${timestamp} ${seg.text}`
    })
    .join('\n')
  return transcript
}

export async function POST(request: NextRequest) {
  try {
    const { videoId } = await request.json()

    if (!videoId || typeof videoId !== 'string') {
      return NextResponse.json({ success: false, error: 'Missing videoId' }, { status: 400 })
    }

    let segments: { text: string; offset?: number; start?: number; duration?: number }[] | null = null
    let errors: string[] = []

    try {
      segments = await fetchFromYoutubeTranscript(videoId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`youtube-transcript: ${msg}`)
    }

    if (!segments || segments.length === 0) {
      try {
        segments = await fetchFromThirdParty(videoId)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(`youtubetranscript.com: ${msg}`)
      }
    }

    if (!segments || segments.length === 0) {
      const detail = errors.join('; ')
      return NextResponse.json(
        { success: false, error: `No transcript available for this video. ${detail}` },
        { status: 404 }
      )
    }

    const title = `YouTube Transcript - ${videoId}`
    const transcript = segmentsToTranscript(segments)

    return NextResponse.json({
      success: true,
      data: {
        title,
        transcript,
        segments: segments.map((s) => ({
          text: s.text,
          start: toSeconds(s.offset ?? s.start),
          duration: toSeconds(s.duration),
        })),
        videoId,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('YouTube transcript error:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
