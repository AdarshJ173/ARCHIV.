'use client'

import { useState, useRef, useEffect } from 'react'
import { Settings, Coffee, ExternalLink } from 'lucide-react'
import ThemeToggle from './ThemeToggle'

const AUTO_SHOW_DELAY = 6000
const RE_SHOW_INTERVAL = 300000

interface Props {
  onSettingsOpen: () => void
  theme: 'light' | 'dark'
  onThemeToggle: () => void
}

export default function Header({ onSettingsOpen, theme, onThemeToggle }: Props) {
  const [showSupport, setShowSupport] = useState(false)
  const supportRef = useRef<HTMLDivElement>(null)
  const hasClickedRef = useRef(false)

  useEffect(() => {
    const autoTimer = setTimeout(() => {
      if (!hasClickedRef.current) setShowSupport(true)
    }, AUTO_SHOW_DELAY)

    const interval = setInterval(() => {
      if (!hasClickedRef.current) setShowSupport(true)
    }, RE_SHOW_INTERVAL)

    return () => {
      clearTimeout(autoTimer)
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (!showSupport) return
    const handleClick = (e: MouseEvent) => {
      if (supportRef.current && !supportRef.current.contains(e.target as Node)) {
        setShowSupport(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showSupport])

  const handleLinkClick = () => {
    hasClickedRef.current = true
    setShowSupport(false)
  }

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
        <div ref={supportRef} style={{ position: 'relative' }}>
          <button
            className="btn btn-icon btn-ghost"
            onClick={() => setShowSupport(!showSupport)}
            title="Support this project"
            style={{
              color: showSupport ? 'var(--accent-rust)' : undefined,
            }}
          >
            <Coffee className="h-[18px] w-[18px]" />
          </button>
          {showSupport && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: '8px',
              width: '240px', padding: '14px', borderRadius: '10px',
              background: 'var(--card)', border: '1px solid var(--border)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              display: 'flex', flexDirection: 'column', gap: '12px',
              zIndex: 100,
            }}>
              <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--foreground)' }}>
                Support ARCHIV.
              </div>
              <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', lineHeight: '1.5' }}>
                If you find this project useful, consider supporting its development.
              </div>
              <a
                href="https://buymeacoffee.com/adarshjaga9"
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleLinkClick}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  padding: '9px 0', borderRadius: '8px', textDecoration: 'none',
                  background: '#FF813F', color: '#fff',
                  fontWeight: 600, fontSize: '13px',
                }}
              >
                <Coffee className="h-[18px] w-[18px]" />
                Buy me a coffee
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img
                  src="/qr-code.png"
                  alt="QR code"
                  style={{ width: '72px', height: '72px', borderRadius: '6px', objectFit: 'cover' }}
                />
                <div style={{ fontSize: '10px', color: 'var(--muted-foreground)', lineHeight: '1.5' }}>
                  Scan to support via UPI or other payment methods.
                </div>
              </div>
            </div>
          )}
        </div>
        <ThemeToggle theme={theme} onToggle={onThemeToggle} />
        <button className="btn btn-icon btn-ghost" onClick={onSettingsOpen} title="Settings">
          <Settings className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  )
}