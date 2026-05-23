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

    const indexWorker = new Worker(new URL('@/workers/index.worker', import.meta.url))
    const embedWorker = new Worker(new URL('@/workers/embed.worker', import.meta.url))

    try {
      // Step 1: Save files to IndexedDB
      setState({ status: 'indexing', totalFiles: files.length, totalChunks: 0, progress: 5, message: 'Saving files...' })
      await saveFiles(files)

      const allChunks: Chunk[] = []

      // Setup embedWorker handlers that can be dynamically set per file
      let currentEmbedResolve: ((val: any[]) => void) | null = null
      let currentEmbedReject: ((err: Error) => void) | null = null
      let currentEmbedProgress: ((current: number, total: number) => void) | null = null

      embedWorker.onmessage = (e) => {
        const data = e.data
        if (data.type === 'model-download') {
          console.log(`[WebRAG]   Model ${data.status === 'loading' ? '↓ downloading' : '✓ ready'} — ${data.model} (${data.dtype || 'default'})`)
        } else if (data.type === 'progress') {
          if (currentEmbedProgress) {
            currentEmbedProgress(data.current, data.total)
          }
        } else if (data.type === 'complete') {
          if (currentEmbedResolve) {
            currentEmbedResolve(data.embeddings)
          }
        } else if (data.type === 'error') {
          if (currentEmbedReject) {
            currentEmbedReject(new Error(data.error))
          }
        }
      }

      // Sequentially process each document: chunk it, embed it, and save it!
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const docPercent = Math.round((i / files.length) * 60) // Indexing documents maps to 5% - 65% overall progress
        const overallProgress = 5 + docPercent

        console.log(`[WebRAG:Pipeline] Processing document [${i + 1}/${files.length}]: ${file.name}...`)
        setState(prev => ({
          ...prev,
          progress: overallProgress,
          message: `Ingesting [${i + 1}/${files.length}]: ${file.name.split('/').pop()}...`
        }))

        // 1. Chunk this specific file in IndexWorker
        const fileChunks = await new Promise<Chunk[]>((resolve, reject) => {
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
            files: [{ id: file.id, text: file.text, fileName: file.name }],
            options: { maxTokens: options?.chunkSize }
          })
        })

        if (fileChunks.length === 0) continue

        // Save this file's chunks to IndexedDB
        await saveChunks(fileChunks)
        allChunks.push(...fileChunks)

        // 2. Embed this file's chunks in EmbedWorker
        const embeddings = await new Promise<any[]>((resolve, reject) => {
          currentEmbedResolve = resolve
          currentEmbedReject = reject
          currentEmbedProgress = (current, total) => {
            const embedPercent = Math.round((current / total) * (60 / files.length))
            setState(prev => ({
              ...prev,
              progress: overallProgress + embedPercent,
              message: `Embedding [${i + 1}/${files.length}]: ${current}/${total} chunks...`
            }))
          }

          embedWorker.postMessage({ chunks: fileChunks.map(c => ({ id: c.id, text: c.text })) })
        })

        const vectors = embeddings.map((emb: { id: string; embedding: number[] }) => ({
          id: emb.id,
          embedding: new Float32Array(emb.embedding),
        }))

        // Save this file's vectors to IndexedDB
        await saveVectors(vectors)
        
        setState(prev => ({
          ...prev,
          totalChunks: allChunks.length,
        }))
      }

      // Step 4: Build BM25 index on ALL chunks in IndexedDB
      console.log(`[WebRAG] Step 4/5: Building BM25 index on all chunks...`)
      setState(prev => ({ ...prev, progress: 75, message: 'Building BM25 index...' }))

      const totalChunksDb = await getAllChunks()
      console.log(`[WebRAG]   Tokenizing ${totalChunksDb.length} chunks for BM25...`)

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
          chunks: totalChunksDb.map(c => ({ id: c.id, text: c.text }))
        })
      })

      await saveBm25Terms(terms)

      // Step 5: Save metadata
      setState(prev => ({ ...prev, progress: 90, message: 'Saving metadata...' }))
      await saveMetadata({
        totalChunks: totalChunksDb.length,
        totalFiles: files.length,
        embeddingDim: 768,
        modelName: 'BAAI/bge-base-en-v1.5',
        indexedAt: Date.now(),
      })

      const totalTime = (performance.now() - tStart) / 1000
      console.log(`[WebRAG] ==============================`)
      console.log(`[WebRAG] INDEXING COMPLETE: ${totalChunksDb.length} chunks from ${files.length} files`)
      console.log(`[WebRAG] ⏱ TOTAL TIME: ${totalTime.toFixed(1)}s`)
      console.log(`[WebRAG] ==============================`)

      setState({
        status: 'ready',
        totalFiles: files.length,
        totalChunks: totalChunksDb.length,
        progress: 100,
        message: `Indexed ${totalChunksDb.length} chunks from ${files.length} files`,
      })
    } catch (err) {
      console.error(`[WebRAG] Indexing failed:`, err)
      setState(prev => ({
        ...prev,
        status: 'error',
        message: err instanceof Error ? err.message : 'Indexing failed',
      }))
    } finally {
      indexWorker.terminate()
      embedWorker.terminate()
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
