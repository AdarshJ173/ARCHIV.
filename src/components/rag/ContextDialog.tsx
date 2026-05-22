'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { getAllFiles } from '@/lib/db'
import type { TranscriptFile } from '@/types'
import { FileText, Upload, X, CheckCircle2, Loader2, FolderOpen, FileUp, AlertCircle } from 'lucide-react'

interface Props {
  open: boolean
  currentlyAttached: string[]
  onConfirm: (fileNames: string[]) => void
  onIndexNewFiles: (files: TranscriptFile[]) => Promise<void>
  onClose: () => void
}

export default function ContextDialog({ open, currentlyAttached, onConfirm, onIndexNewFiles, onClose }: Props) {
  const [indexedFiles, setIndexedFiles] = useState<TranscriptFile[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(currentlyAttached))
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const t1 = setTimeout(() => setLoading(true), 0)
    const t2 = setTimeout(() => setNewFiles([]), 0)
    getAllFiles().then(files => {
      setIndexedFiles(files)
      setSelected(new Set(currentlyAttached))
      setLoading(false)
    })
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [open, currentlyAttached])

  const toggleFile = useCallback((name: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    setSelected(prev => {
      const next = new Set(prev)
      const allSelected = indexedFiles.every(f => next.has(f.name))
      if (allSelected) {
        for (const f of indexedFiles) {
          next.delete(f.name)
        }
      } else {
        for (const f of indexedFiles) {
          next.add(f.name)
        }
      }
      return next
    })
  }, [indexedFiles])

  const handleNewFiles = useCallback((fileList: FileList) => {
    const valid = Array.from(fileList).filter(f => f && /\.(txt|md)$/i.test(f.name))
    setNewFiles(prev => {
      const map = new Map(prev.map(f => [f.name, f]))
      for (const f of valid) map.set(f.name, f)
      return [...map.values()]
    })
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files) handleNewFiles(e.dataTransfer.files)
  }, [handleNewFiles])

  const handleBrowse = useCallback(() => fileInputRef.current?.click(), [])
  const handleFolder = useCallback(() => folderInputRef.current?.click(), [])

  const removeNewFile = useCallback((name: string) => {
    setNewFiles(prev => prev.filter(f => f.name !== name))
  }, [])

  const [indexingNew, setIndexingNew] = useState(false)
  const [indexError, setIndexError] = useState<string | null>(null)

  const handleConfirm = async () => {
    if (indexingNew) return
    const allFileNames = new Set(selected)

    const newProcessed: TranscriptFile[] = []
    const tasks = newFiles.map(async (f, idx) => {
      try {
        const text = await f.text()
        newProcessed.push({
          id: `ctx_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 8)}`,
          name: f.name,
          text,
          size: f.size,
          uploadedAt: Date.now(),
        })
        allFileNames.add(f.name)
      } catch (err) {
        console.warn(`[WebRAG] Failed to read context file ${f.name}:`, err)
      }
    })
    await Promise.all(tasks)

    if (allFileNames.size === 0) return

    if (newProcessed.length > 0) {
      setIndexingNew(true)
      setIndexError(null)
      try {
        await onIndexNewFiles(newProcessed)
      } catch (err) {
        setIndexError(err instanceof Error ? err.message : 'Indexing failed')
        setIndexingNew(false)
        return
      }
    }

    onConfirm([...allFileNames])
  }

  const availableNames = new Set(indexedFiles.map(f => f.name))
  const anySelected = selected.size > 0 || newFiles.length > 0
  const alreadyAttached = currentlyAttached.filter(n => availableNames.has(n))

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal animate-slide-up" style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Attach Context</h2>
          <button className="modal-close" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '16px', lineHeight: '1.5' }}>
            Select previously indexed files or upload new content to use as context for this session.
            You must attach at least one file before chatting.
          </p>

          {alreadyAttached.length > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--success)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', background: 'rgba(45, 107, 63, 0.06)', borderRadius: '4px' }}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {alreadyAttached.length} file{alreadyAttached.length !== 1 ? 's' : ''} already attached
            </div>
          )}

          <div className="settings-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div className="settings-section-title" style={{ fontSize: '12px', margin: 0 }}>
                <FileText className="h-3.5 w-3.5" />
                Previously Indexed
              </div>
              {!loading && indexedFiles.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAll}
                  style={{
                    fontSize: '11px',
                    color: 'var(--accent)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    transition: 'all 0.2s ease',
                  }}
                  className="hover-bright"
                >
                  {indexedFiles.every(f => selected.has(f.name)) ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--muted-foreground)', padding: '16px 0' }}>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading indexed files...
              </div>
            ) : indexedFiles.length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', padding: '12px 0', fontStyle: 'italic' }}>
                No indexed files yet. Upload new content below.
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border)', borderRadius: '4px', maxHeight: '200px', overflowY: 'auto' }}>
                {indexedFiles.map(f => {
                  const isSelected = selected.has(f.name)
                  return (
                    <div
                      key={f.id}
                      className={`video-row ${isSelected ? 'active' : ''}`}
                      onClick={() => toggleFile(f.name)}
                      style={{ cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="video-row-checkbox"
                      />
                      <FileText className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--muted-foreground)', marginRight: '8px' }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="video-row-title">{f.name}</div>
                        <div className="video-row-date">{(f.size / 1024).toFixed(1)} KB</div>
                      </div>
                      <span style={{ fontSize: '10px', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                        <CheckCircle2 className="h-3 w-3" />
                        available
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="settings-section">
            <div className="settings-section-title" style={{ fontSize: '12px', marginBottom: '8px' }}>
              <FileUp className="h-3.5 w-3.5" />
              Upload New Content
            </div>

            <div
              className="dropzone"
              onClick={handleBrowse}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              style={{ cursor: 'pointer' }}
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
              onChange={(e) => { if (e.target.files) handleNewFiles(e.target.files); e.target.value = '' }}
            />
            <input
              ref={folderInputRef}
              type="file"
              {...{ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files) handleNewFiles(e.target.files); e.target.value = '' }}
            />

            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', marginBottom: newFiles.length > 0 ? '12px' : '0' }}>
              <button className="btn btn-secondary btn-sm" onClick={handleBrowse}>
                <Upload className="h-3.5 w-3.5" />
                Select Files
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handleFolder}>
                <FolderOpen className="h-3.5 w-3.5" />
                Select Folder
              </button>
            </div>

            {newFiles.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: '4px', maxHeight: '150px', overflowY: 'auto' }}>
                {newFiles.map(f => (
                  <div key={f.name} className="video-row">
                    <FileText className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--muted-foreground)', marginRight: '8px' }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="video-row-title">{f.name}</div>
                      <div className="video-row-date">{(f.size / 1024).toFixed(1)} KB</div>
                    </div>
                    <button
                      className="trash-btn"
                      onClick={(e) => { e.stopPropagation(); removeNewFile(f.name) }}
                      style={{ flexShrink: 0 }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          {indexError && (
            <div style={{ fontSize: '11px', color: 'var(--error)', marginRight: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlertCircle className="h-3 w-3" />
              {indexError}
            </div>
          )}
          <button className="btn btn-secondary" onClick={onClose} disabled={indexingNew}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={!anySelected || indexingNew}
          >
            {indexingNew ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Indexing...</>
            ) : anySelected ? (
              <>Start Chatting ({selected.size + newFiles.length} file{(selected.size + newFiles.length) !== 1 ? 's' : ''})</>
            ) : (
              'Select or upload files first'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
