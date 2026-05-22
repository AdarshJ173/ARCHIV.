import { useState, useCallback } from 'react'
import type { TranscriptFile, Chunk, IndexState } from '@/types'
import { chunkFiles } from '@/lib/chunker'
import { saveFiles, saveChunks, saveVectors, saveBm25Terms, saveMetadata, clearAll, getAllChunks, getAllFiles, deleteFileAndData, clearBm25, clearMetadata } from '@/lib/db'
import { buildBm25Index, bm25IndexToTerms } from '@/lib/bm25'

export function useIndex() {
  const [state, setState] = useState<IndexState>({
    status: 'idle',
    totalFiles: 0,
    totalChunks: 0,
    progress: 0,
    message: '',
  })

  const indexFiles = useCallback(async (files: TranscriptFile[], options?: { chunkSize?: number }) => {
    const tStart = performance.now()
    console.log(`[WebRAG] ==============================`)
    console.log(`[WebRAG] INDEXING STARTED: ${files.length} files`)
    console.log(`[WebRAG] Files:`, files.map(f => `${f.name} (${(f.size / 1024).toFixed(1)} KB)`).join(', '))

    const indexWorker = new Worker(new URL('@/workers/index.worker', import.meta.url))

    try {
      let t = performance.now()
      console.log(`[WebRAG] Step 1/5: Saving files to IndexedDB (0%) [elapsed: 0ms]`)
      setState({ status: 'indexing', totalFiles: files.length, totalChunks: 0, progress: 0, message: 'Saving files...' })
      await saveFiles(files)
      console.log(`[WebRAG] Step 1/5: Complete - ${files.length} files saved [+${(performance.now()-t).toFixed(0)}ms]`)

      t = performance.now()
      console.log(`[WebRAG] Step 2/5: Chunking files in background worker... (10%)`)
      setState(prev => ({ ...prev, progress: 10, message: 'Chunking files...' }))
      const chunkInputs = files.map(f => ({ id: f.id, text: f.text, fileName: f.name }))
      
      const chunks = await new Promise<Chunk[]>((resolve, reject) => {
        indexWorker.onmessage = (e) => {
          const { type, chunks, error } = e.data
          if (type === 'chunk-complete') {
            resolve(chunks)
          } else if (type === 'error') {
            reject(new Error(error))
          }
        }
        indexWorker.onerror = (err) => {
          reject(err)
        }
        indexWorker.postMessage({
          type: 'chunk',
          files: chunkInputs,
          options: { maxTokens: options?.chunkSize }
        })
      })

      await saveChunks(chunks)
      console.log(`[WebRAG] Step 2/5: Complete - ${chunks.length} chunks [+${(performance.now()-t).toFixed(0)}ms] [total: ${(performance.now()-tStart).toFixed(0)}ms]`)

      setState(prev => ({ ...prev, totalChunks: chunks.length, progress: 15, message: 'Embedding chunks...' }))

      t = performance.now()
      console.log(`[WebRAG] Step 3/5: Starting embedding process (15%)`)
      console.log(`[WebRAG]   Model: Xenova/bge-base-en-v1.5 (768-dim)`)
      console.log(`[WebRAG]   Chunks: ${chunks.length}`)

      const embedWorker = new Worker(new URL('@/workers/embed.worker', import.meta.url))

      await new Promise<void>((resolve, reject) => {
        embedWorker.onmessage = async (e) => {
          const data = e.data
          if (data.type === 'model-download') {
            console.log(`[WebRAG]   Model ${data.status === 'loading' ? '↓ downloading' : '✓ ready'} — ${data.model} (${data.dtype || 'default'})`)
          } else if (data.type === 'progress') {
            const pct = Math.round((data.current / data.total) * 50)
            const overall = 15 + pct
            console.log(`[WebRAG]   Embedding: ${data.current}/${data.total} chunks (${Math.round(data.current/data.total*100)}%) [+${(performance.now()-t).toFixed(0)}ms] — Overall: ${overall}%`)
            setState(prev => ({ ...prev, progress: overall, message: `Embedding ${data.current}/${data.total}...` }))
          } else if (data.type === 'complete') {
            console.log(`[WebRAG] Step 3/5: Embedding complete - ${data.embeddings.length} vectors [+${(performance.now()-t).toFixed(0)}ms] [total: ${(performance.now()-tStart).toFixed(0)}ms]`)
            t = performance.now()
            const vectors = data.embeddings.map((emb: { id: string; embedding: number[] }) => ({
              id: emb.id,
              embedding: new Float32Array(emb.embedding),
            }))
            console.log(`[WebRAG]   Saving ${vectors.length} vectors to IndexedDB...`)
            await saveVectors(vectors)
            console.log(`[WebRAG]   Vectors saved [+${(performance.now()-t).toFixed(0)}ms]`)
            embedWorker.terminate()
            resolve()
          } else if (data.type === 'error') {
            console.error(`[WebRAG] Embedding worker error:`, data.error)
            embedWorker.terminate()
            reject(new Error(data.error))
          }
        }
        embedWorker.onerror = (err) => {
          console.error(`[WebRAG] Embedding worker fatal error:`, err)
          embedWorker.terminate()
          reject(err)
        }
        embedWorker.postMessage({ chunks: chunks.map(c => ({ id: c.id, text: c.text })) })
      })

      t = performance.now()
      console.log(`[WebRAG] Step 4/5: Building BM25 index in background worker (65%)`)
      setState(prev => ({ ...prev, progress: 65, message: 'Building BM25 index...' }))

      const allChunks = await getAllChunks()
      console.log(`[WebRAG]   Tokenizing ${allChunks.length} chunks for BM25...`)
      
      const terms = await new Promise<any[]>((resolve, reject) => {
        indexWorker.onmessage = (e) => {
          const { type, terms, error } = e.data
          if (type === 'bm25-complete') {
            resolve(terms)
          } else if (type === 'error') {
            reject(new Error(error))
          }
        }
        indexWorker.onerror = (err) => {
          reject(err)
        }
        indexWorker.postMessage({
          type: 'bm25',
          chunks: allChunks.map(c => ({ id: c.id, text: c.text }))
        })
      })

      t = performance.now()
      console.log(`[WebRAG]   Saving BM25 terms to IndexedDB...`)
      await saveBm25Terms(terms)
      console.log(`[WebRAG]   BM25 terms saved [+${(performance.now()-t).toFixed(0)}ms]`)
      console.log(`[WebRAG] Step 4/5: BM25 complete [total: ${(performance.now()-tStart).toFixed(0)}ms]`)

      t = performance.now()
      setState(prev => ({ ...prev, progress: 85, message: 'Saving metadata...' }))

      await saveMetadata({
        totalChunks: chunks.length,
        totalFiles: files.length,
        embeddingDim: 768,
        modelName: 'BAAI/bge-base-en-v1.5',
        indexedAt: Date.now(),
      })
      console.log(`[WebRAG]   Metadata saved [+${(performance.now()-t).toFixed(0)}ms]`)

      const totalTime = (performance.now() - tStart) / 1000
      console.log(`[WebRAG] ==============================`)
      console.log(`[WebRAG] INDEXING COMPLETE: ${chunks.length} chunks from ${files.length} files`)
      console.log(`[WebRAG] ⏱ TOTAL TIME: ${totalTime.toFixed(1)}s`)
      console.log(`[WebRAG] ==============================`)

      setState({
        status: 'ready',
        totalFiles: files.length,
        totalChunks: chunks.length,
        progress: 100,
        message: `Indexed ${chunks.length} chunks from ${files.length} files`,
      })
    } catch (err) {
      console.error(`[WebRAG] Indexing failed after ${((performance.now() - tStart)/1000).toFixed(1)}s:`, err)
      setState(prev => ({
        ...prev,
        status: 'error',
        message: err instanceof Error ? err.message : 'Indexing failed',
      }))
    } finally {
      indexWorker.terminate()
    }
  }, [])

  const deleteFile = useCallback(async (fileId: string) => {
    console.log(`[WebRAG] Deleting file ${fileId}...`)
    setState(prev => ({ ...prev, status: 'indexing', progress: 0, message: 'Removing file...' }))

    await deleteFileAndData(fileId)

    const remainingChunks = await getAllChunks()
    if (remainingChunks.length > 0) {
      const tempWorker = new Worker(new URL('@/workers/index.worker', import.meta.url))
      try {
        const terms = await new Promise<any[]>((resolve, reject) => {
          tempWorker.onmessage = (e) => {
            if (e.data.type === 'bm25-complete') resolve(e.data.terms)
            else if (e.data.type === 'error') reject(new Error(e.data.error))
          }
          tempWorker.onerror = reject
          tempWorker.postMessage({
            type: 'bm25',
            chunks: remainingChunks.map(c => ({ id: c.id, text: c.text }))
          })
        })
        await saveBm25Terms(terms)
      } catch (err) {
        console.error(`[WebRAG] Failed to build BM25 after delete in background:`, err)
      } finally {
        tempWorker.terminate()
      }
    } else {
      await clearBm25()
    }

    const remainingFiles = await getAllFiles()
    if (remainingFiles.length > 0) {
      await saveMetadata({
        totalChunks: remainingChunks.length,
        totalFiles: remainingFiles.length,
        embeddingDim: 768,
        modelName: 'BAAI/bge-base-en-v1.5',
        indexedAt: Date.now(),
      })
    } else {
      await clearMetadata()
    }

    console.log(`[WebRAG] File deleted. ${remainingFiles.length} files, ${remainingChunks.length} chunks remaining`)
    setState({
      status: remainingFiles.length > 0 ? 'ready' : 'idle',
      totalFiles: remainingFiles.length,
      totalChunks: remainingChunks.length,
      progress: remainingFiles.length > 0 ? 100 : 0,
      message: remainingFiles.length > 0
        ? `Deleted. ${remainingChunks.length} chunks remaining.`
        : 'All files removed.',
    })

    return remainingFiles
  }, [])

  const resetIndex = useCallback(async () => {
    console.log(`[WebRAG] Clearing all data from IndexedDB...`)
    await clearAll()
    setState({ status: 'idle', totalFiles: 0, totalChunks: 0, progress: 0, message: '' })
    console.log(`[WebRAG] Index cleared`)
  }, [])

  return { state, indexFiles, deleteFile, resetIndex }
}
