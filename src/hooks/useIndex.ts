import { useState, useCallback } from 'react'
import type { IndexState, TranscriptFile } from '@/types'
import { ingestFiles as apiIngestFiles, deleteIndexedFile as apiDeleteFile, clearAllIndexes as apiClearAll, getIndexedFiles } from '@/lib/api'

export function useIndex() {
  const [state, setState] = useState<IndexState>({
    status: 'idle',
    totalFiles: 0,
    totalChunks: 0,
    progress: 0,
    message: '',
  })

  // Keep compatibility with TranscriptFile[] input by converting to standard File objects
  const indexFiles = useCallback(async (files: TranscriptFile[], _options?: { chunkSize?: number }) => {
    
    try {
      // Convert TranscriptFile[] to standard HTML File objects for upload
      const htmlFiles = files.map(file => {
        const blob = new Blob([file.text], { type: 'text/plain' })
        return new File([blob], file.name, { type: 'text/plain', lastModified: Date.now() })
      })

      await apiIngestFiles(htmlFiles, (progressState) => {
        setState(progressState)
      })

    } catch (err) {
      console.error(`[WebRAG] Indexing via API failed:`, err)
      setState(prev => ({
        ...prev,
        status: 'error',
        message: err instanceof Error ? err.message : 'Indexing failed',
      }))
    }
  }, [])

  const indexRawFiles = useCallback(async (files: File[]) => {
    
    try {
      await apiIngestFiles(files, (progressState) => {
        setState(progressState)
      })
    } catch (err) {
      console.error(`[WebRAG] Raw file indexing via API failed:`, err)
      setState(prev => ({
        ...prev,
        status: 'error',
        message: err instanceof Error ? err.message : 'Indexing failed',
      }))
    }
  }, [])

  const deleteFile = useCallback(async (fileId: string) => {
    setState(prev => ({ ...prev, status: 'indexing', progress: 50, message: 'Removing file...' }))

    try {
      await apiDeleteFile(fileId)
      
      // Fetch updated list to report new count
      const remaining = await getIndexedFiles()
      const chunkCount = remaining.reduce((acc, curr) => acc + (curr.chunksCount || 0), 0)

      setState({
        status: remaining.length > 0 ? 'ready' : 'idle',
        totalFiles: remaining.length,
        totalChunks: chunkCount,
        progress: remaining.length > 0 ? 100 : 0,
        message: remaining.length > 0 
          ? `Deleted. ${chunkCount} chunks remaining.` 
          : 'All files removed.',
      })

      // Convert back to standard frontend objects if needed by callers
      return remaining.map(r => ({
        id: r.id,
        name: r.name,
        text: '', // don't load text for general metadata lists
        size: r.size,
        uploadedAt: r.uploadedAt
      }))

    } catch (err) {
      console.error('[WebRAG] Failed to delete file:', err)
      setState(prev => ({
        ...prev,
        status: 'error',
        message: err instanceof Error ? err.message : 'Deletion failed'
      }))
      return []
    }
  }, [])

  const resetIndex = useCallback(async () => {
    try {
      await apiClearAll()
      setState({ status: 'idle', totalFiles: 0, totalChunks: 0, progress: 0, message: '' })
    } catch (err) {
      console.error('[WebRAG] Failed to reset indexes:', err)
      setState(prev => ({
        ...prev,
        status: 'error',
        message: err instanceof Error ? err.message : 'Reset failed'
      }))
    }
  }, [])

  // Helper to synchronize local state with backend stats
  const syncWithBackend = useCallback(async () => {
    try {
      const files = await getIndexedFiles()
      const chunkCount = files.reduce((acc, curr) => acc + (curr.chunksCount || 0), 0)
      setState({
        status: files.length > 0 ? 'ready' : 'idle',
        totalFiles: files.length,
        totalChunks: chunkCount,
        progress: files.length > 0 ? 100 : 0,
        message: files.length > 0 ? 'Synchronized with local backend.' : '',
      })
    } catch (e) {
      console.warn('[WebRAG] Backend is not active or reachable.', e)
    }
  }, [])

  return { state, indexFiles, indexRawFiles, deleteFile, resetIndex, syncWithBackend }
}
