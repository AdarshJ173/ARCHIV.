export interface TranscriptFile {
  id: string
  name: string
  text: string
  size: number
  uploadedAt: number
}
export interface FileMetadata {
  id: string
  name: string
  size: number
  uploadedAt: number
  chunksCount?: number
}


export interface Chunk {
  id: string
  text: string
  source: string
  chunkIndex: number
  fileId: string
}

export interface VectorRecord {
  id: string
  embedding: Float32Array
}

export interface Bm25Term {
  term: string
  docFreqs: Record<string, number>
}

export interface IndexMetadata {
  totalChunks: number
  totalFiles: number
  embeddingDim: number
  modelName: string
  indexedAt: number
}

export interface YouTubeSegment {
  text: string
  start: number
  duration: number
}

export interface YouTubeTranscriptResult {
  title: string
  segments: YouTubeSegment[]
  transcript: string
  videoId: string
}

export interface YouTubeChannelVideo {
  id: string
  title: string
  publishedAt: string
}

export interface YouTubeChannelResult {
  channelName: string
  channelId: string
  videos: YouTubeChannelVideo[]
}

export interface SearchResult {
  id: string
  text: string
  source: string
  score: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
  model?: string
  timestamp: number
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  attachedFiles: string[]
  createdAt: number
  updatedAt: number
}

export interface IndexState {
  status: 'idle' | 'loading' | 'indexing' | 'ready' | 'error'
  totalFiles: number
  totalChunks: number
  progress: number
  message: string
}

export type VideoFetchStatus = 'pending' | 'fetching' | 'done' | 'failed' | 'no-captions'

export interface VideoFetchInfo {
  videoId: string
  title: string
  status: VideoFetchStatus
  error?: string
  result?: YouTubeTranscriptResult
}

export interface BatchFetchOptions {
  concurrency?: number
  maxRetries?: number
  signal?: AbortSignal
  onProgress?: (results: VideoFetchInfo[]) => void
}
