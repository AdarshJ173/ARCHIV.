'use client'

import { useCallback, useRef, useState, useMemo, useEffect } from 'react'
import { useIndex } from '@/hooks/useIndex'
import { getIndexedFiles } from '@/lib/api'
import type { FileMetadata } from '@/types'
import { FileText, FolderOpen, Loader2, CheckCircle2, AlertCircle, RefreshCw, Upload, Database, FileUp, Brain, BookTemplate, Trash2, Trash } from 'lucide-react'
import { getFilesFromDragEvent, isValidFile } from '../../lib/upload'

export default function LibraryPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const { state, indexRawFiles, deleteFile, resetIndex, syncWithBackend } = useIndex()
  const [files, setFiles] = useState<FileMetadata[]>([])
  const [deleting, setDeleting] = useState<string | null>(null)

  // Imperatively set directory attributes on mount to ensure folder selection works flawlessly
  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '')
      folderInputRef.current.setAttribute('directory', '')
    }
  }, [])

  const loadFiles = useCallback(async () => {
    try {
      const indexed = await getIndexedFiles()
      setFiles(indexed)
    } catch {
      console.warn('[WebRAG:Library] Backend offline or fetch failed.')
    }
  }, [])

  // Synchronize stats once on mount
  useEffect(() => {
    syncWithBackend()
  }, [syncWithBackend])

  // Load indexed files on mount and reload when indexing completes/updates
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFiles()
  }, [state.status, loadFiles])

  const processFiles = useCallback(async (fileList: FileList | File[]) => {
    const validFiles = Array.from(fileList).filter(isValidFile)
    
    if (validFiles.length === 0) return

    try {
      await indexRawFiles(validFiles)
      await loadFiles()
    } catch {
      // Silence loud dev logging
    }
  }, [indexRawFiles, loadFiles])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files)
    e.target.value = ""
  }, [processFiles])

  const handleFolderSelect = useCallback(() => {
    folderInputRef.current?.click()
  }, [])

  const handleDeleteFile = useCallback(async (fileId: string) => {
    setDeleting(fileId)
    await deleteFile(fileId)
    await loadFiles()
    setDeleting(null)
  }, [deleteFile, loadFiles])

  const handleReset = async () => {
    await resetIndex()
    setFiles([])
  }

  const pipelineStages = useMemo(() => [
    { id: "load", label: "Upload & Parse", icon: FileUp },
    { id: "chunk", label: "Semantic Chunking", icon: BookTemplate },
    { id: "embed", label: "GPU Embedding", icon: Brain },
    { id: "index", label: "FAISS & BM25 Index", icon: Database },
  ], [])

  const getPipelineStatus = (stageId: string): "pending" | "active" | "complete" => {
    if (state.status === "ready") return "complete"
    if (state.status !== "indexing" && state.status !== "loading") return "pending"
    const msg = state.message.toLowerCase()
    const order = ["load", "chunk", "embed", "index"]
    const idx = order.indexOf(stageId)
    const progress = state.progress
    
    // If uploading
    if (state.status === "loading") {
      if (idx === 0) return "active"
      return "pending"
    }
    
    // If indexing (progress is 30 - 100%)
    if (idx === 0) {
      if (msg.includes("parse") || progress < 38) return "active"
      return "complete"
    }
    
    if (idx === 1) {
      if (progress < 38) return "pending"
      if (msg.includes("chunk") || (progress >= 38 && progress < 49)) return "active"
      return "complete"
    }
    
    if (idx === 2) {
      if (progress < 49) return "pending"
      if (msg.includes("embed") || (progress >= 49 && progress < 89)) return "active"
      return "complete"
    }
    
    if (idx === 3) {
      if (progress < 89) return "pending"
      if (msg.includes("index") || msg.includes("save") || progress >= 89) return "active"
      return "pending"
    }
    
    return "pending"
  }

  return (
    <>
      <div className="panel-section">
        <div className="panel-section-title">Knowledge Base Stats</div>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{state.totalFiles || files.length || 0}</div>
            <div className="stat-label">Documents</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{state.totalChunks || 0}</div>
            <div className="stat-label">Chunks</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{state.totalChunks > 0 ? "768d" : "\u2014"}</div>
            <div className="stat-label">Embeddings</div>
          </div>
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-section-title">Import Transcripts (FastAPI Parser)</div>
        <div
          className={`dropzone ${state.status === 'indexing' || state.status === 'loading' ? 'disabled' : ''}`}
          onClick={() => {
            if (state.status !== 'indexing' && state.status !== 'loading') fileInputRef.current?.click()
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault()
            if (state.status === 'indexing' || state.status === 'loading') return
            try {
              const files = await getFilesFromDragEvent(e)
              processFiles(files)
            } catch (err) {
              console.error('[WebRAG] Failed to parse dropped items:', err)
            }
          }}
          style={{
            opacity: state.status === 'indexing' || state.status === 'loading' ? 0.6 : 1,
            pointerEvents: state.status === 'indexing' || state.status === 'loading' ? 'none' : 'auto',
            cursor: state.status === 'indexing' || state.status === 'loading' ? 'not-allowed' : 'pointer'
          }}
        >
          <Upload className="dropzone-icon" />
          <div className="dropzone-text">
            {state.status === 'indexing' || state.status === 'loading' ? 'Ingesting in progress...' : 'Drop files here'}
          </div>
          <div className="dropzone-hint">
            {state.status === 'indexing' || state.status === 'loading'
              ? 'Please wait for current files to finish' 
              : 'or click to browse · PDF, DOCX, PPTX, XLSX, TXT, MD supported'}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.md,.pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.json,.js,.ts,.py,.csv,.html,.css,.log"
          className="hidden"
          onChange={handleFileSelect}
          disabled={state.status === 'indexing' || state.status === 'loading'}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          disabled={state.status === 'indexing' || state.status === 'loading'}
        />
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <button 
            className="btn btn-secondary btn-sm" 
            onClick={handleFolderSelect}
            disabled={state.status === 'indexing' || state.status === 'loading'}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Select Folder
          </button>
        </div>
      </div>

      {files.length > 0 && (
        <div className="panel-section animate-fade-in">
          <div className="panel-section-title">Files ({files.length})</div>
          <div className="file-list">
            {files.map((f) => {
              let statusIcon = <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "var(--success)" }} />
              if (state.status === "error") statusIcon = <AlertCircle className="h-3.5 w-3.5" style={{ color: "var(--error)" }} />
              const isDeleting = deleting === f.id
              return (
                <div key={f.id} className="file-item">
                  <FileText className="file-icon" />
                  <span className="file-name" title={f.name}>{f.name}</span>
                  <span className="file-size">{(f.size / 1024).toFixed(1)} KB</span>
                  <div className="file-status">
                    {isDeleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "var(--muted-foreground)" }} />
                    ) : (
                      statusIcon
                    )}
                  </div>
                  <button
                    className="trash-btn"
                    onClick={() => handleDeleteFile(f.id)}
                    disabled={isDeleting || state.status === 'indexing' || state.status === 'loading'}
                    title="Delete this file and its index data"
                    style={{ flexShrink: 0, marginLeft: '4px' }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {(state.status === "indexing" || state.status === "ready" || state.status === "loading") && (
        <div className="panel-section animate-fade-in">
          <div className="panel-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Indexing Pipeline</span>
            {(state.status === "indexing" || state.status === "loading") && (
              <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '11px' }}>{state.progress}%</span>
            )}
          </div>
          {(state.status === "indexing" || state.status === "loading") && (
            <div className="progress-bar" style={{ marginBottom: "12px" }}>
              <div className="progress-fill accent" style={{ width: `${state.progress}%` }} />
            </div>
          )}
          <div className="pipeline">
            {pipelineStages.map((stage) => {
              const status = getPipelineStatus(stage.id)
              const Icon = stage.icon
              return (
                <div key={stage.id} className={`pipeline-stage ${status}`}>
                  <div className="pipeline-stage-icon">
                    {status === "complete" ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : status === "active" ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <div className="pipeline-stage-label">{stage.label}</div>
                </div>
              )
            })}
          </div>
          {(state.status === "indexing" || state.status === "loading") && (
            <div style={{ marginTop: "12px", fontSize: "11px", color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: "6px", background: 'rgba(255,255,255,0.02)', padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border)' }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'var(--accent)' }} />
              <span>{state.message || "Processing documents..."}</span>
            </div>
          )}
          {state.status === "ready" && (
            <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--success)", display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 className="h-4 w-4" />
              {state.message}
            </div>
          )}
        </div>
      )}

      {state.status === "error" && (
        <div className="panel-section animate-fade-in">
          <div className="panel-section-title">Indexing Pipeline</div>
          <div style={{ fontSize: "12px", color: "var(--error)", display: "flex", alignItems: "center", gap: "6px" }}>
            <AlertCircle className="h-4 w-4" />
            {state.message}
            <button className="btn btn-sm btn-ghost" onClick={handleReset} style={{ marginLeft: "auto" }}>
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="panel-section">
          <button className="btn btn-secondary btn-sm" onClick={handleReset} disabled={state.status === 'indexing'} style={{ width: '100%' }}>
            <Trash className="h-3.5 w-3.5" />
            Clear All Data
          </button>
          <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', marginTop: '6px', textAlign: 'center' }}>
            Removes all files, chunks, vectors, and BM25 index. The ML model cache is preserved.
          </div>
        </div>
      )}

      {state.status === "idle" && files.length === 0 && (
        <div className="empty-state" style={{ flex: 1 }}>
          <Database className="empty-icon" />
          <div className="empty-text">No knowledge base yet</div>
          <div className="empty-hint">Upload transcript files to build your local RAG index</div>
        </div>
      )}
    </>
  )
}
