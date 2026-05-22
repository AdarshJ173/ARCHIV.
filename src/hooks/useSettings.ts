import { useState, useEffect, useCallback } from 'react'

interface Settings {
  openrouterKey: string
  youtubeDataKey: string
  model: string
  topK: number
  chunkSize: number
}

const STORAGE_KEY = 'webrag-settings'
const DEFAULT: Settings = {
  openrouterKey: process.env.NEXT_PUBLIC_OPENROUTER_KEY || '',
  youtubeDataKey: process.env.NEXT_PUBLIC_YOUTUBE_DATA_API_KEY || 'AIzaSyBOCe23nKICUkhoUVSC8jh9KieK8VTs6gc',
  model: 'openai/gpt-4o-mini',
  topK: 5,
  chunkSize: 512,
}

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(DEFAULT)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setSettingsState({ ...DEFAULT, ...JSON.parse(stored) })
    } catch { /* ignore */ }
    setLoaded(true)
  }, [])

  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
  }, [])

  return { settings, setSettings, loaded }
}
