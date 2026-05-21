import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { videoId } = await request.json()

    if (!videoId || typeof videoId !== 'string') {
      return NextResponse.json({ success: false, error: 'Missing videoId' }, { status: 400 })
    }

    const { fetchTranscript } = await import('youtube-transcript')

    const segments = await fetchTranscript(videoId)

    const title = `YouTube Transcript - ${videoId}`
    const transcript = segments
      .map((seg: { text: string; start?: number; duration?: number }) => {
        if (seg.start !== undefined) {
          const minutes = Math.floor(seg.start / 60)
          const seconds = Math.floor(seg.start % 60)
          const timestamp = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}]`
          return `${timestamp} ${seg.text}`
        }
        return seg.text
      })
      .join('\n')

    return NextResponse.json({
      success: true,
      data: {
        title,
        transcript,
        segments,
        videoId,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('YouTube transcript error:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
