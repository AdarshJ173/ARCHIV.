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

async function resolveChannelId(channelIdentifier: string, apiKey: string): Promise<string> {
  if (channelIdentifier.startsWith('UC')) return channelIdentifier

  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${channelIdentifier}&type=channel&key=${apiKey}`
  )
  const searchData = await searchRes.json()
  if (!searchData.items?.length) throw new Error('Channel not found')
  return searchData.items[0].snippet.channelId
}

async function getUploadsPlaylistId(channelId: string, apiKey: string): Promise<string | null> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`
  )
  const data = await res.json()
  return data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null
}

async function getChannelName(channelId: string, apiKey: string): Promise<string | null> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${apiKey}`
  )
  const data = await res.json()
  return data.items?.[0]?.snippet?.title || null
}

async function listUploads(playlistId: string, apiKey: string) {
  const videos: Array<{ id: string; title: string; publishedAt: string }> = []
  let pageToken = ''

  do {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}&key=${apiKey}`
    const res = await fetch(url)
    const data = await res.json()

    if (data.error) {
      if (data.error.code === 403 && data.error.errors?.some((e: { reason: string }) => e.reason === 'quotaExceeded')) {
        throw Object.assign(new Error('YouTube API quota exceeded. The quota resets daily. Try again tomorrow or use a different API key.'), { status: 429 })
      }
      throw new Error(data.error.message)
    }

    for (const item of data.items || []) {
      videos.push({
        id: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        publishedAt: item.snippet.publishedAt,
      })
    }

    pageToken = data.nextPageToken || ''
  } while (pageToken)

  return videos
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

    const channelId = await resolveChannelId(channelIdentifier, apiKey)

    const uploadsPlaylistId = await getUploadsPlaylistId(channelId, apiKey)
    if (!uploadsPlaylistId) {
      return NextResponse.json(
        { success: false, error: 'Could not find uploads playlist for this channel' },
        { status: 404 }
      )
    }

    const videos = await listUploads(uploadsPlaylistId, apiKey)

    const channelName = await getChannelName(channelId, apiKey) || channelIdentifier

    return NextResponse.json({
      success: true,
      data: {
        channelName,
        channelId,
        videos,
      },
    })
  } catch (error: unknown) {
    if (error instanceof Error) {
      const errWithStatus = error as Error & { status?: number }
      if (errWithStatus.status) {
        return NextResponse.json({ success: false, error: error.message }, { status: errWithStatus.status })
      }
    }
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('YouTube channel error:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
