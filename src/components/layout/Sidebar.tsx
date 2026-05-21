'use client'

import { useState, useEffect } from 'react'
import type { ChatSession } from '@/types'
import { getAllFiles } from '@/lib/db'
import { Film, BookOpen, MessageSquare, Plus, Trash2 } from 'lucide-react'

interface Props {
  activePanel: string
  onPanelChange: (panel: string) => void
  sessions: ChatSession[]
  activeSessionId: string | null
  onCreateSession: () => void
  onSwitchSession: (id: string) => void
  onDeleteSession: (id: string) => void
}

export default function Sidebar({
  activePanel,
  onPanelChange,
  sessions,
  activeSessionId,
  onCreateSession,
  onSwitchSession,
  onDeleteSession,
}: Props) {
  const [fileCount, setFileCount] = useState(0)
  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)

  useEffect(() => {
    getAllFiles().then(files => setFileCount(files.length))
  }, [sessions])

  return (
    <aside className="sidebar">
      <nav style={{ padding: '16px 12px 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <button
          className={`nav-item ${activePanel === 'youtube' ? 'active' : ''}`}
          onClick={() => onPanelChange('youtube')}
        >
          <Film className="h-[18px] w-[18px]" />
          YouTube
        </button>
        <button
          className={`nav-item ${activePanel === 'library' ? 'active' : ''}`}
          onClick={() => onPanelChange('library')}
        >
          <BookOpen className="h-[18px] w-[18px]" />
          Library
          {fileCount > 0 && <span className="nav-badge">{fileCount}</span>}
        </button>
        <button
          className={`nav-item ${activePanel === 'chat' ? 'active' : ''}`}
          onClick={() => onPanelChange('chat')}
        >
          <MessageSquare className="h-[18px] w-[18px]" />
          Research
        </button>
      </nav>

      <div className="sessions-header">
        <span className="sessions-title">Sessions</span>
        <button className="btn btn-icon btn-ghost" onClick={onCreateSession} title="New session" style={{ padding: '2px', minWidth: '22px', minHeight: '22px' }}>
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        <div style={{ overflowY: 'auto', height: '100%' }}>
          {sortedSessions.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', fontSize: '11px', color: 'var(--muted-foreground)' }}>
              No sessions yet
            </div>
          ) : (
            sortedSessions.map((s) => (
              <div
                key={s.id}
                className={`session-item ${s.id === activeSessionId ? 'active' : ''}`}
                onClick={() => { onSwitchSession(s.id); onPanelChange('chat') }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') { onSwitchSession(s.id); onPanelChange('chat') } }}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {s.title}
                </span>
                <button
                  className="trash-btn"
                  onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id) }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="privacy-footer">
        All processing happens locally.
      </div>
    </aside>
  )
}
