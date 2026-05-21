'use client'

import { useCallback, useRef, useState, useMemo, useEffect } from 'react'
import { useIndex } from '@/hooks/useIndex'
import { getAllFiles } from '@/lib/db'
import type { TranscriptFile } from '@/types'
import { FileText, FolderOpen, Loader2, CheckCircle2, AlertCircle, RefreshCw, Upload, Database, FileUp, Brain, BookTemplate, Trash2, Trash } from 'lucide-react'

export default function LibraryPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const { state, indexFiles, deleteFile, resetIndex } = useIndex()
  const [files, setFiles] = useState<TranscriptFile[]>([])
  const [deleting, setDeleting] = useState<string | null>(null)

  const loadFiles = useCallback(async () => {
    const indexed = await getAllFiles()
    setFiles(indexed)
  }, [])

  useEffect(() => { const t = setTimeout(() => loadFiles(), 0); return () => clearTimeout(t) }, [loadFiles])

  const processFiles = useCallback(async (fileList: FileList) => {
    const transcriptFiles: TranscriptFile[] = []
    const total = fileList.length
    for (let i = 0; i < total; i++) {
      const file = fileList[i]
      if (/\.(txt|md)$/i.test(file.name)) {
        const text = await file.text()
        transcriptFiles.push({
          id: `${Date.now()}_${i}`,
          name: file.webkitRelativePath || file.name,
          text,
          size: file.size,
          uploadedAt: Date.now(),
        })
      }
    }
    if (transcriptFiles.length === 0) return
    setFiles(prev => {
      const existing = new Map(prev.map(f => [f.name, f]))
      for (const f of transcriptFiles) existing.set(f.name, f)
      return [...existing.values()]
    })
    await indexFiles(transcriptFiles)
  }, [indexFiles])

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
    setFiles(prev => prev.filter(f => f.id !== fileId))
    setDeleting(null)
  }, [deleteFile])

  const handleReset = async () => {
    await resetIndex()
    setFiles([])
  }

  const pipelineStages = useMemo(() => [
    { id: "load", label: "Load", icon: FileUp },
    { id: "chunk", label: "Chunk", icon: BookTemplate },
    { id: "embed", label: "Embed", icon: Brain },
    { id: "index", label: "Index", icon: Database },
  ], [])

  const getPipelineStatus = (stageId: string): "pending" | "active" | "complete" => {
    if (state.status === "ready") return "complete"
    if (state.status !== "indexing") return "pending"
    const msg = state.message.toLowerCase()
    const order = ["load", "chunk", "embed", "index"]
    const idx = order.indexOf(stageId)
    const progress = state.progress
    if (idx === 0 && (msg.includes("save") || msg.includes("load") || progress <= 10)) return "active"
    if (idx === 0) return "complete"
    if (idx === 1 && msg.includes("chunk")) return "active"
    if (idx === 1 && progress > 10) return "complete"
    if (idx === 2 && msg.includes("embed")) return "active"
    if (idx === 2 && progress > 30) return "complete"
    if (idx === 3 && (msg.includes("bm25") || msg.includes("meta") || msg.includes("save"))) return "active"
    if (idx === 3 && progress > 80) return "active"
    return "pending"
  }

  return (
    <>
      <div className="panel-section">
        <div className="panel-section-title">Knowledge Base</div>
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
        <div className="panel-section-title">Import Transcripts</div>
        <div
          className="dropzone"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files) processFiles(e.dataTransfer.files) }}
        >
          <Upload className="dropzone-icon" />
          <div className="dropzone-text">Drop transcript files here</div>
          <div className="dropzone-hint">or click to browse &middot; .txt, .md supported</div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.md"
          className="hidden"
          onChange={handleFileSelect}
        />
        <input
          ref={folderInputRef}
          type="file"
          {...{ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>}
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <button className="btn btn-secondary btn-sm" onClick={handleFolderSelect}>
            <FolderOpen className="h-3.5 w-3.5" />
            Select Folder
          </button>
        </div>
      </div>

      {files.length > 0 && (
        <div className="panel-section">
          <div className="panel-section-title">Files ({files.length})</div>
          <div className="file-list">
            {files.map((f) => {
              let statusIcon = <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "var(--success)" }} />
              if (state.status === "error") statusIcon = <AlertCircle className="h-3.5 w-3.5" style={{ color: "var(--error)" }} />
              const isDeleting = deleting === f.id
              return (
                <div key={f.id} className="file-item">
                  <FileText className="file-icon" />
                  <span className="file-name">{f.name}</span>
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
                    disabled={isDeleting || state.status === 'indexing'}
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

      {(state.status === "indexing" || state.status === "ready") && (
        <div className="panel-section">
          <div className="panel-section-title">Indexing Pipeline</div>
          {state.status === "indexing" && (
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
          {state.status === "ready" && (
            <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--success)", display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 className="h-4 w-4" />
              {state.message}
            </div>
          )}
        </div>
      )}

      {state.status === "error" && (
        <div className="panel-section">
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
