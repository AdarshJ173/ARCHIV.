import { chunkFiles, type ChunkInput, type ChunkOutput } from '@/lib/chunker'

self.onmessage = (e: MessageEvent<{ files: ChunkInput[] }>) => {
  const { files } = e.data
  const chunks = chunkFiles(files)
  self.postMessage({ chunks })
}
