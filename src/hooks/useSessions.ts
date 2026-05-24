'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { ChatSession, ChatMessage } from '@/types'

const STORAGE_KEY = 'webrag-sessions'

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

export function useSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions())
  const [activeId, setActiveId] = useState<string | null>(null)
  const initDone = useRef(false)

  const activeSession = sessions.find(s => s.id === activeId) || null
  const currentMessages = activeSession?.messages || []

  const createNew = useCallback(() => {
    const session: ChatSession = {
      id: Date.now().toString(),
      title: `Chat ${sessions.length + 1}`,
      messages: [],
      attachedFiles: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setSessions(prev => [session, ...prev])
    setActiveId(session.id)
  }, [sessions.length])

  useEffect(() => {
    if (initDone.current) return
    initDone.current = true
    if (sessions.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveId(sessions[0].id)
    } else {
      createNew()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    if (initDone.current) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
      } catch {}
    }
  }, [sessions])

  const setSessionContext = useCallback((sessionId: string, fileNames: string[]) => {
    setSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, attachedFiles: fileNames, updatedAt: Date.now() } : s
    ))
  }, [])

  const switchSession = useCallback((id: string) => {
    setActiveId(id)
  }, [])

  const deleteSession = useCallback((id: string) => {
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id)
      if (filtered.length === 0) {
          const newSession: ChatSession = {
            id: Date.now().toString(),
            title: 'Chat 1',
            messages: [],
            attachedFiles: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
        setActiveId(newSession.id)
        return [newSession]
      }
      if (activeId === id) {
        setActiveId(filtered[0].id)
      }
      return filtered
    })
  }, [activeId])

  const addMessage = useCallback((msg: ChatMessage) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== activeId) return s
      const updated = {
        ...s,
        messages: [...s.messages, msg],
        updatedAt: Date.now(),
      }
      if (s.messages.length === 0) {
        updated.title = msg.role === 'user'
          ? msg.content.substring(0, 50) + (msg.content.length > 50 ? '...' : '')
          : s.title
      }
      return updated
    }))
  }, [activeId])

  const updateLastAssistantMessage = useCallback((content: string, model?: string, sources?: string[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== activeId) return s
      const msgs = [...s.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], content, model, sources: sources || msgs[i].sources }
          break
        }
      }
      return { ...s, messages: msgs, updatedAt: Date.now() }
    }))
  }, [activeId])

  return {
    sessions,
    activeId,
    activeSession,
    currentMessages,
    createNew,
    switchSession,
    deleteSession,
    addMessage,
    updateLastAssistantMessage,
    setSessionContext,
  }
}
