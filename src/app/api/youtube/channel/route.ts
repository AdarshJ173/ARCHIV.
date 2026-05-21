import { NextRequest, NextResponse } from 'next/server'

function extractChannelId(url: string): string | null {
  const patterns = [
    /youtube\.com\/@([\w-]+)/,
    /youtube\.com\/channel\/(UC[\w-]{22})/,
    /youtube\.com\/c\/([\w-]+)/,
    /youtube\.com\/user\/([\w-]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }

  return null
}

export async function POST(request: NextRequest) {
  try {
    const { channelUrl, apiKey } = await request.json()

    if (!channelUrl || !apiKey) {
      return NextResponse.json(
        { success: false, error: 'Missing channelUrl or apiKey' },
        { status: 400 }
      )
    }

    const channelIdentifier = extractChannelId(channelUrl)
    if (!channelIdentifier) {
      return NextResponse.json(
        { success: false, error: 'Could not parse channel URL' },
        { status: 400 }
      )
    }

    const isChannelId = channelIdentifier.startsWith('UC')
    let channelId: string

    if (isChannelId) {
      channelId = channelIdentifier
    } else {
      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${channelIdentifier}&type=channel&key=${apiKey}`
      )
      const searchData = await searchRes.json()
      if (!searchData.items?.length) {
        return NextResponse.json(
          { success: false, error: 'Channel not found' },
          { status: 404 }
        )
      }
      channelId = searchData.items[0].snippet.channelId
    }

    const allVideos: Array<{ id: string; title: string; publishedAt: string }> = []
    let pageToken = ''

    const maxVideos = 2000

    do {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=50&type=video${pageToken ? `&pageToken=${pageToken}` : ''}&key=${apiKey}`
      const res = await fetch(url)
      const data = await res.json()

      if (data.error) {
        if (data.error.code === 403 && data.error.errors?.some((e: { reason: string }) => e.reason === 'quotaExceeded')) {
          return NextResponse.json(
            { success: false, error: 'YouTube API quota exceeded. The quota resets daily. Try again tomorrow or use a different API key.' },
            { status: 429 }
          )
        }
        return NextResponse.json(
          { success: false, error: data.error.message },
          { status: 400 }
        )
      }

      if (data.items) {
        for (const item of data.items) {
          allVideos.push({
            id: item.id.videoId,
            title: item.snippet.title,
            publishedAt: item.snippet.publishedAt,
          })
        }
      }

      pageToken = data.nextPageToken || ''
    } while (pageToken && allVideos.length < maxVideos)

    let channelName = channelIdentifier
    if (allVideos.length > 0) {
      const firstRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${apiKey}`
      )
      const channelData = await firstRes.json()
      if (channelData.items?.length) {
        channelName = channelData.items[0].snippet.title
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        channelName,
        channelId,
        videos: allVideos,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('YouTube channel error:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
