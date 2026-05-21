'use client'

import { useState, useCallback } from 'react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import YouTubeDownloader from '@/components/youtube/YouTubeDownloader'
import LibraryPanel from '@/components/rag/LibraryPanel'
import ChatPanel from '@/components/rag/ChatPanel'
import SettingsDialog from '@/components/rag/Settings'
import ContextDialog from '@/components/rag/ContextDialog'
import { useSessions } from '@/hooks/useSessions'
import { useSearch } from '@/hooks/useSearch'
import { useSettings } from '@/hooks/useSettings'
import { useIndex } from '@/hooks/useIndex'

export default function Home() {
  const [activePanel, setActivePanel] = useState('youtube')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [contextDialogTarget, setContextDialogTarget] = useState<string | null>(null)
  const { settings } = useSettings()
  const { search, searching, abortSearch, tokenStats } = useSearch()
  const { indexFiles } = useIndex()
  const {
    sessions, activeId, currentMessages,
    createNew, switchSession, deleteSession, addMessage,
    setSessionContext,
  } = useSessions()

  const openContextDialogForSession = useCallback((sessionId: string) => {
    setContextDialogTarget(sessionId)
  }, [])

  const handlePanelChange = useCallback((panel: string) => {
    setActivePanel(panel)
  }, [])

  const handleSwitchSession = useCallback((id: string) => {
    switchSession(id)
    setActivePanel('chat')
  }, [switchSession])

  const handleNewSessionClick = useCallback(() => {
    createNew()
    setActivePanel('chat')
  }, [createNew])

  const handleContextConfirm = useCallback(async (fileNames: string[]) => {
    if (!contextDialogTarget) return
    setSessionContext(contextDialogTarget, fileNames)
    setContextDialogTarget(null)
  }, [contextDialogTarget, setSessionContext])

  const handleSend = useCallback(async (question: string) => {
    const now = Date.now()
    const session = sessions.find(s => s.id === activeId)
    if (!session || session.attachedFiles.length === 0) {
      if (activeId) openContextDialogForSession(activeId)
      return
    }
    if (!settings.openrouterKey) {
      addMessage({
        id: now.toString(),
        role: 'assistant',
        content: 'Please set your OpenRouter API key in settings first.',
        timestamp: now,
      })
      return
    }
    const userMsg = {
      id: (now + 1).toString(),
      role: 'user' as const,
      content: question,
      timestamp: now,
    }
    addMessage(userMsg)
    const attachedFiles = session.attachedFiles
    const assistantMsg = await search(question, settings.openrouterKey, attachedFiles)
    if (assistantMsg) addMessage(assistantMsg)
  }, [sessions, activeId, settings, addMessage, search, openContextDialogForSession])

  const attachedFileNames = sessions.find(s => s.id === activeId)?.attachedFiles || []

  return (
    <>
      <DashboardLayout
        activePanel={activePanel}
        onPanelChange={handlePanelChange}
        sessions={sessions}
        activeSessionId={activeId}
        onCreateSession={handleNewSessionClick}
        onSwitchSession={handleSwitchSession}
        onDeleteSession={deleteSession}
        settingsOpen={settingsOpen}
        onSettingsOpen={() => setSettingsOpen(true)}
        onSettingsClose={() => setSettingsOpen(false)}
      >
        {activePanel === 'youtube' && (
          <div className="panel-content animate-fade-in">
            <YouTubeDownloader />
          </div>
        )}
        {activePanel === 'library' && (
          <div className="panel-content animate-fade-in">
            <LibraryPanel />
          </div>
        )}
        {activePanel === 'chat' && (
          <div className="panel-content animate-fade-in" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
            <ChatPanel
              messages={currentMessages}
              onSend={handleSend}
              searching={searching}
              onStop={abortSearch}
              attachedFiles={attachedFileNames}
              onAttachContext={() => activeId && openContextDialogForSession(activeId)}
              tokenStats={tokenStats}
            />
          </div>
        )}
      </DashboardLayout>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {contextDialogTarget && (
        <ContextDialog
          open={!!contextDialogTarget}
          currentlyAttached={sessions.find(s => s.id === contextDialogTarget)?.attachedFiles || []}
          onConfirm={handleContextConfirm}
          onIndexNewFiles={indexFiles}
          onClose={() => setContextDialogTarget(null)}
        />
      )}
    </>
  )
}
