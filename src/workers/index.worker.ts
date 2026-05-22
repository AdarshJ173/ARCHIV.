import { chunkFiles } from '../lib/chunker'
import { buildBm25Index, bm25IndexToTerms } from '../lib/bm25'

self.onmessage = (e: MessageEvent<any>) => {
  const { type, ...data } = e.data

  try {
    if (type === 'chunk') {
      const { files, options } = data
      console.log(`[WebRAG:IndexWorker] Off-thread chunking initiated for ${files.length} files...`)
      const chunks = chunkFiles(files, options)
      self.postMessage({ type: 'chunk-complete', chunks })
    } else if (type === 'bm25') {
      const { chunks } = data
      console.log(`[WebRAG:IndexWorker] Off-thread BM25 index compiling initiated for ${chunks.length} chunks...`)
      const bm25Index = buildBm25Index(chunks)
      const terms = bm25IndexToTerms(bm25Index)
      self.postMessage({ type: 'bm25-complete', terms })
    }
  } catch (err) {
    console.error('[WebRAG:IndexWorker] Background worker failed:', err)
    self.postMessage({
      type: 'error',
      error: err instanceof Error ? err.message : 'Unknown background indexing error'
    })
  }
}
