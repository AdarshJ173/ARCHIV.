const BGE_QUERY_PREFIX = 'Represent this sentence for searching relevant passages: '

interface EmbedInput {
  chunks: Array<{ id: string; text: string }>
  isQuery?: boolean
}

let embedder: any = null
let isWebGPUActive = false

async function getEmbedder() {
  if (embedder) {
    return embedder
  }

  const { pipeline } = await import('@huggingface/transformers')

  const t = performance.now()
  self.postMessage({ type: 'model-download', model: 'Xenova/bge-base-en-v1.5', dtype: 'q8', status: 'loading' })

  try {
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      console.log('[WebRAG:Worker] Attempting WebGPU initialization for BGE model...')
      embedder = await pipeline('feature-extraction', 'Xenova/bge-base-en-v1.5', {
        device: 'webgpu',
      })
      isWebGPUActive = true
      console.log('[WebRAG:Worker] WebGPU BGE model loaded successfully.')
    } else {
      throw new Error('WebGPU not supported in this environment')
    }
  } catch (webgpuError) {
    console.warn('[WebRAG:Worker] WebGPU failed or unsupported, falling back to WASM/CPU:', webgpuError)
    isWebGPUActive = false
    try {
      embedder = await pipeline('feature-extraction', 'Xenova/bge-base-en-v1.5', {
        device: 'wasm',
        dtype: 'q8',
      })
    } catch {
      embedder = await pipeline('feature-extraction', 'Xenova/bge-base-en-v1.5')
    }
  }

  console.log(`[WebRAG:Worker] BGE model loaded in ${(performance.now()-t).toFixed(0)}ms`)
  self.postMessage({ type: 'model-download', model: 'Xenova/bge-base-en-v1.5', status: 'ready' })
  return embedder
}

self.onmessage = async (e: MessageEvent<EmbedInput>) => {
  const { chunks, isQuery } = e.data
  const tStart = performance.now()

  try {
    const extractor = await getEmbedder()

    const batchSize = isWebGPUActive ? 64 : 16
    const allEmbeddings: Array<{ id: string; embedding: number[] }> = []
    const batchTimes: number[] = []


    for (let i = 0; i < chunks.length; i += batchSize) {
      const tBatch = performance.now()
      const batch = chunks.slice(i, i + batchSize)
      const texts = batch.map((c) =>
        isQuery ? BGE_QUERY_PREFIX + c.text : c.text
      )

      const outputs = await extractor(texts, {
        pooling: 'mean',
        normalize: true,
      })

      for (let j = 0; j < batch.length; j++) {
        const arr = Array.from(outputs[j].data as Float32Array)
        allEmbeddings.push({ id: batch[j].id, embedding: arr })
      }

      const current = Math.min(i + batchSize, chunks.length)
      const pct = Math.round((current / chunks.length) * 100)
      const batchDuration = performance.now() - tBatch
      batchTimes.push(batchDuration)

      const avgBatch = batchTimes.length > 0
        ? (batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length)
        : 0
      const remaining = Math.ceil((chunks.length - current) / batchSize)
      const eta = (remaining * avgBatch / 1000).toFixed(1)

      console.log(`[WebRAG:Worker] Batch ${i/batchSize+1}/${Math.ceil(chunks.length/batchSize)}: ${current}/${chunks.length} (${pct}%) [${batchDuration.toFixed(0)}ms] [ETA: ${eta}s]`)

      self.postMessage({
        type: 'progress',
        current,
        total: chunks.length,
      })
    }

    const totalTime = (performance.now() - tStart) / 1000
    const avgTime = batchTimes.length > 0
      ? (batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length).toFixed(0)
      : 'N/A'
    console.log(`[WebRAG:Worker] Embedding complete: ${allEmbeddings.length} vectors in ${totalTime.toFixed(1)}s (avg batch: ${avgTime}ms)`)
    self.postMessage({ type: 'complete', embeddings: allEmbeddings })
  } catch (err) {
    console.error(`[WebRAG:Worker] Embedding failed after ${((performance.now()-tStart)/1000).toFixed(1)}s:`, err)
    self.postMessage({
      type: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}
