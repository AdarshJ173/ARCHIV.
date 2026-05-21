'use client'

import { type ReactNode, useState, useEffect } from 'react'
import Header from './Header'
import Sidebar from './Sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ChatSession } from '@/types'

interface Props {
  children: ReactNode
  activePanel: string
  onPanelChange: (panel: string) => void
  sessions: ChatSession[]
  activeSessionId: string | null
  onCreateSession: () => void
  onSwitchSession: (id: string) => void
  onDeleteSession: (id: string) => void
  settingsOpen: boolean
  onSettingsOpen: () => void
  onSettingsClose: () => void
}

function getInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  const stored = localStorage.getItem('archiv-theme')
  if (stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    return 'dark'
  }
  return 'light'
}

export default function DashboardLayout({
  children,
  activePanel,
  onPanelChange,
  sessions,
  activeSessionId,
  onCreateSession,
  onSwitchSession,
  onDeleteSession,
  settingsOpen,
  onSettingsOpen,
  onSettingsClose,
}: Props) {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && settingsOpen) onSettingsClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [settingsOpen, onSettingsClose])

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('archiv-theme', next)
      return next
    })
  }

  return (
    <TooltipProvider>
      <div id="app">
        <Header
          onSettingsOpen={onSettingsOpen}
          theme={theme}
          onThemeToggle={toggleTheme}
        />
        <Sidebar
          activePanel={activePanel}
          onPanelChange={onPanelChange}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onCreateSession={onCreateSession}
          onSwitchSession={onSwitchSession}
          onDeleteSession={onDeleteSession}
        />
        <main className="main-area">
          {children}
        </main>
      </div>
    </TooltipProvider>
  )
}
