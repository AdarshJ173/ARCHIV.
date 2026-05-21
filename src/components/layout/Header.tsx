'use client'

import { Settings } from 'lucide-react'
import ThemeToggle from './ThemeToggle'

interface Props {
  onSettingsOpen: () => void
  theme: 'light' | 'dark'
  onThemeToggle: () => void
}

export default function Header({ onSettingsOpen, theme, onThemeToggle }: Props) {
  return (
    <header className="header">
      <div className="flex items-center gap-4">
        <span className="wordmark">
          ARCHIV<span className="wordmark-accent">.</span>
        </span>
        <span className="status-pill">
          <span className="status-dot" />
          All Local
        </span>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle theme={theme} onToggle={onThemeToggle} />
        <button className="btn btn-icon btn-ghost" onClick={onSettingsOpen} title="Settings">
          <Settings className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  )
}
