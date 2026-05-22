import { cosineSimilarity, rrf } from '@/lib/vector-search'
import { bm25Search } from '@/lib/bm25'

interface SearchInput {
  queryVec: number[]
  vectors: Array<{ id: string; embedding: number[] }>
  chunks: Array<{ id: string; text: string; source: string }>
  query: string
  bm25Terms: Array<{ term: string; docFreqs: Record<string, number> }>
  topK?: number
}

interface RerankInput {
  query: string
  pairs: Array<{ id: string; text: string; source: string }>
}

function tokenizeBM25(text: string): string[] {
  return text.replace(/[^\w\s]/g, '').toLowerCase().split(/\s+/).filter(Boolean)
}

self.onmessage = async (e: MessageEvent<SearchInput | RerankInput>) => {
  const data = e.data

  if ('pairs' in data) {
    const { query, pairs } = data as RerankInput
    const tRerank = performance.now()
    console.log(`[WebRAG:Worker] Reranking ${pairs.length} candidates...`)
    const reranked = await runReranker(query, pairs)
    console.log(`[WebRAG:Worker] Reranking done in ${(performance.now()-tRerank).toFixed(0)}ms [top score: ${reranked[0]?.score?.toFixed(4)}]`)
    self.postMessage({ type: 'rerank', results: reranked })
    return
  }

  const { queryVec, vectors, chunks, query, bm25Terms, topK = 5 } = data as SearchInput
  const tStart = performance.now()

  const RERANKED_TOP_K = topK
  const VECTOR_TOP_K = Math.max(topK * 3, 30)
  const BM25_TOP_K = Math.max(topK * 3, 30)
  const FUSED_TOP_K = Math.max(topK * 3, 30)
  const RRF_K = 60

  console.log(`[WebRAG:Worker] Search pipeline: ${vectors.length} vectors, ${chunks.length} chunks, ${bm25Terms.length} terms, topK: ${topK}`)

  const queryFloat = new Float32Array(queryVec)

  let t = performance.now()
  const vecResults = vectors
    .map((v) => ({
      id: v.id,
      score: cosineSimilarity(queryFloat, new Float32Array(v.embedding)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, VECTOR_TOP_K)
  const vecTime = performance.now() - t
  console.log(`[WebRAG:Worker] Vector search: ${vecResults.length} results [+${vecTime.toFixed(0)}ms] [top: ${vecResults[0]?.score?.toFixed(4)}]`)

  t = performance.now()
  const bm25Index = {
    avgDocLen: 0,
    docCount: chunks.length,
    docLengths: new Map(chunks.map((c) => [c.id, tokenizeBM25(c.text).length])),
    termFreqs: new Map<string, Map<string, number>>(),
    idf: new Map<string, number>(),
  }

  let totalLen = 0
  for (const c of chunks) {
    totalLen += tokenizeBM25(c.text).length
  }
  bm25Index.avgDocLen = totalLen / chunks.length

  for (const t of bm25Terms) {
    const docMap = new Map<string, number>(Object.entries(t.docFreqs))
    bm25Index.termFreqs.set(t.term, docMap)
    const df = docMap.size
    bm25Index.idf.set(t.term, Math.log(1 + (chunks.length - df + 0.5) / (df + 0.5)))
  }

  const bm25Results = bm25Search(bm25Index, query, BM25_TOP_K)
  const bm25Time = performance.now() - t
  console.log(`[WebRAG:Worker] BM25 search: ${bm25Results.length} results [+${bm25Time.toFixed(0)}ms] [top: ${bm25Results[0]?.score?.toFixed(4)}]`)

  t = performance.now()
  const vecIds = vecResults.map((r) => r.id)
  const bm25Ids = bm25Results.map((r) => r.id)

  const fused = rrf([vecIds, bm25Ids], RRF_K)
  const fusedIds = fused.slice(0, FUSED_TOP_K).map((r) => r.id)
  console.log(`[WebRAG:Worker] RRF fusion: ${fusedIds.length} candidates [+${(performance.now()-t).toFixed(0)}ms]`)

  const chunkMap = new Map(chunks.map((c) => [c.id, c]))
  const rerankCandidates = fusedIds
    .filter((id) => chunkMap.has(id))
    .map((id) => ({
      id,
      text: chunkMap.get(id)!.text,
      source: chunkMap.get(id)!.source,
    }))

  t = performance.now()
  const reranked = await runReranker(query, rerankCandidates)
  const final = reranked.slice(0, RERANKED_TOP_K)
  const rerankTime = performance.now() - t

  const totalTime = (performance.now() - tStart) / 1000
  console.log(`[WebRAG:Worker] ⏱ Pipeline: ${totalTime.toFixed(1)}s total [vec:${vecTime.toFixed(0)}ms, bm25:${bm25Time.toFixed(0)}ms, rerank:${rerankTime.toFixed(0)}ms]`)
  console.log(`[WebRAG:Worker] Final results: top score=${final[0]?.score?.toFixed(4)}`)

  self.postMessage({ type: 'search', results: final })
}

let rerankerInstance: any = null

async function getReranker() {
  if (rerankerInstance) return rerankerInstance

  const { pipeline, env } = await import('@huggingface/transformers')

  // Prioritize Discrete GPU (dGPU) if available, falling back to Integrated GPU (iGPU) and then WASM (CPU)
  if (env.backends?.onnx?.wasm) {
    (env.backends.onnx.wasm as any).webgpu = {
      powerPreference: 'high-performance'
    }
  }
  
  self.postMessage({ type: 'rerank-model-load', status: 'loading' })
  const t = performance.now()

  try {
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      console.log('[WebRAG:Worker] Attempting WebGPU initialization for Reranker...')
      rerankerInstance = await pipeline('text-classification', 'Xenova/bge-reranker-base', {
        device: 'webgpu',
      })
      console.log('[WebRAG:Worker] WebGPU Reranker loaded successfully.')
    } else {
      throw new Error('WebGPU not supported in this environment')
    }
  } catch (webgpuError) {
    console.warn('[WebRAG:Worker] WebGPU Reranker failed or unsupported, falling back to WASM/CPU:', webgpuError)
    try {
      rerankerInstance = await pipeline('text-classification', 'Xenova/bge-reranker-base', {
        device: 'wasm',
        dtype: 'q8',
      })
    } catch {
      rerankerInstance = await pipeline('text-classification', 'Xenova/bge-reranker-base')
    }
  }

  console.log(`[WebRAG:Worker] Reranker model loaded in ${(performance.now()-t).toFixed(0)}ms`)
  self.postMessage({ type: 'rerank-model-load', status: 'ready' })
  return rerankerInstance
}

async function runReranker(
  query: string,
  pairs: Array<{ id: string; text: string; source: string }>
): Promise<Array<{ id: string; text: string; source: string; score: number }>> {
  try {
    const reranker = await getReranker()

    const t = performance.now()
    const scored = await Promise.all(
      pairs.map(async (pair) => {
        const result = await reranker(`${query} [SEP] ${pair.text}`)
        const score = Array.isArray(result) ? result[0].score : (result as any).score
        return { ...pair, score }
      })
    )
    console.log(`[WebRAG:Worker] Cross-encoder scored ${pairs.length} pairs in ${(performance.now()-t).toFixed(0)}ms`)

    return scored.sort((a, b) => b.score - a.score)
  } catch (err) {
    console.warn(`[WebRAG:Worker] Cross-encoder failed, falling back to rank-based scoring:`, err)
    return pairs.map((p, i) => ({ ...p, score: pairs.length - i }))
  }
}

