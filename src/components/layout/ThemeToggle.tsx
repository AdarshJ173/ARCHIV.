'use client'

import { Sun, Moon } from 'lucide-react'

interface Props {
  theme: 'light' | 'dark'
  onToggle: () => void
}

export default function ThemeToggle({ theme, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      className="btn btn-icon btn-ghost tooltip"
      data-tip={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  )
}
