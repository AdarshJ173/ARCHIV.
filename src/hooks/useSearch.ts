import { useState, useCallback, useRef } from 'react'
import type { SearchResult, ChatMessage } from '@/types'
import { getAllVectors, getAllChunks, getAllBm25Terms } from '@/lib/db'
import { queryLLM, buildRagPrompt } from '@/lib/openrouter'

export interface TokenStats {
  totalPrompt: number
  totalCompletion: number
  totalTokens: number
  requestCount: number
}

export function useSearch() {
  const [searching, setSearching] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const workersRef = useRef<Worker[]>([])
  const [tokenStats, setTokenStats] = useState<TokenStats>({
    totalPrompt: 0,
    totalCompletion: 0,
    totalTokens: 0,
    requestCount: 0,
  })

  const search = useCallback(async (question: string, apiKey: string, attachedFiles?: string[]): Promise<ChatMessage | null> => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    workersRef.current = []
    setSearching(true)

    const tStart = performance.now()

    console.log(`[WebRAG] ==============================`)
    console.log(`[WebRAG] SEARCH STARTED: "${question}"`)

    try {
      let t = performance.now()
      console.log(`[WebRAG] Step 1/6: Loading index data from IndexedDB...`)
      let [vectors, chunks, bm25Terms] = await Promise.all([
        getAllVectors(),
        getAllChunks(),
        getAllBm25Terms(),
      ])
      console.log(`[WebRAG]   Loaded: ${vectors.length} vectors, ${chunks.length} chunks, ${bm25Terms.length} BM25 terms [+${(performance.now()-t).toFixed(0)}ms]`)

      if (attachedFiles && attachedFiles.length > 0) {
        const allowedSources = new Set(attachedFiles)
        chunks = chunks.filter(c => allowedSources.has(c.source))
        const allowedIds = new Set(chunks.map(c => c.id))
        vectors = vectors.filter(v => allowedIds.has(v.id))
        bm25Terms = bm25Terms.map(t => ({
          term: t.term,
          docFreqs: Object.fromEntries(
            Object.entries(t.docFreqs).filter(([docId]) => allowedIds.has(docId))
          ),
        })).filter(t => Object.keys(t.docFreqs).length > 0)
        console.log(`[WebRAG]   Filtered by session context: ${vectors.length} vectors, ${chunks.length} chunks, ${bm25Terms.length} BM25 terms`)
      }

      if (vectors.length === 0 || chunks.length === 0) {
        console.warn(`[WebRAG] No index found`)
        return {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'No index found. Please index your transcripts first.',
          timestamp: Date.now(),
        }
      }

      t = performance.now()
      console.log(`[WebRAG] Step 2/6: Embedding query with BGE...`)
      const searchWorker = new Worker(new URL('@/workers/search.worker', import.meta.url))
      const embedWorker = new Worker(new URL('@/workers/embed.worker', import.meta.url))
      workersRef.current = [searchWorker, embedWorker]

      const searchResult = await new Promise<SearchResult[]>((resolve, reject) => {
        searchWorker.onmessage = async (e) => {
          const data = e.data
          if (data.type === 'search') {
            resolve(data.results)
          }
        }
        searchWorker.onerror = reject

        embedWorker.onmessage = (e2) => {
          if (e2.data.type === 'complete') {
            embedWorker.terminate()
            const queryVec = e2.data.embeddings[0].embedding
            console.log(`[WebRAG]   Query embedded [+${(performance.now()-t).toFixed(0)}ms]`)

            console.log(`[WebRAG] Steps 3-6/6: Search pipeline + rerank + LLM...`)

            searchWorker.postMessage({
              queryVec,
              vectors: vectors.map(v => ({ id: v.id, embedding: Array.from(v.embedding) })),
              chunks: chunks.map(c => ({ id: c.id, text: c.text, source: c.source })),
              query: question,
              bm25Terms: bm25Terms.map(t => ({ term: t.term, docFreqs: t.docFreqs })),
            })
          }
        }
        embedWorker.postMessage({ chunks: [{ id: 'query', text: question }], isQuery: true })
      })

      searchWorker.terminate()
      workersRef.current = []
      console.log(`[WebRAG]   Search pipeline returned ${searchResult.length} results [+${(performance.now()-t).toFixed(0)}ms]`)

      const contexts = searchResult.map(r => ({ text: r.text, source: r.source }))
      const sources = [...new Set(contexts.map(c => c.source))]

      if (contexts.length === 0) {
        console.warn(`[WebRAG] No relevant transcripts found [${((performance.now()-tStart)/1000).toFixed(1)}s]`)
        return {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'No relevant transcripts found.',
          sources: [],
          timestamp: Date.now(),
        }
      }

      console.log(`[WebRAG]   Sources:`, sources.join(', '))

      t = performance.now()
      console.log(`[WebRAG] Step 5/6: Building RAG prompt with ${contexts.length} context chunks`)
      const prompt = buildRagPrompt(question, contexts)
      console.log(`[WebRAG]   Prompt length: ${prompt.length} chars [+${(performance.now()-t).toFixed(0)}ms]`)

      t = performance.now()
      console.log(`[WebRAG] Step 6/6: Querying OpenRouter LLM...`)

      const { answer, model, promptTokens, completionTokens, totalTokens } = await queryLLM(
        prompt, apiKey, { signal: controller.signal }
      )

      if (totalTokens) {
        setTokenStats(prev => ({
          totalPrompt: prev.totalPrompt + (promptTokens ?? 0),
          totalCompletion: prev.totalCompletion + (completionTokens ?? 0),
          totalTokens: prev.totalTokens + totalTokens,
          requestCount: prev.requestCount + 1,
        }))
      }

      const llmTime = performance.now() - t
      const totalTime = (performance.now() - tStart) / 1000
      console.log(`[WebRAG]   LLM responded (+${llmTime.toFixed(0)}ms): ${answer.length} chars from "${model}"`)
      console.log(`[WebRAG] ⏱ SEARCH COMPLETE: ${totalTime.toFixed(1)}s total`)
      console.log(`[WebRAG] ==============================`)

      return {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: answer,
        sources,
        model,
        timestamp: Date.now(),
      }
    } catch (err) {
      if (controller.signal.aborted) {
        console.log(`[WebRAG] Search aborted by user [${((performance.now() - tStart)/1000).toFixed(1)}s]`)
        return null
      }
      console.error(`[WebRAG] Search failed after ${((performance.now() - tStart)/1000).toFixed(1)}s:`, err)
      return {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Search failed'}`,
        timestamp: Date.now(),
      }
    } finally {
      setSearching(false)
      if (abortRef.current === controller) abortRef.current = null
      workersRef.current = []
    }
  }, [])

  const abortSearch = useCallback(() => {
    abortRef.current?.abort()
    workersRef.current.forEach(w => w.terminate())
    workersRef.current = []
  }, [])

  return { search, searching, abortSearch, tokenStats }
}