import { useState, useEffect, useCallback } from 'react'
import { updateBackendSettings } from '@/lib/api'

export interface Settings {
  openrouterKey: string;
  youtubeDataKey: string;
  model: string;
  topK: number;
  chunkSize: number;
  
  // New backend configurations
  llmProvider: 'openrouter' | 'ollama' | 'openai';
  ollamaModel: string;
  ollamaUrl: string;
  openaiKey: string;
  openaiModel: string;
  enableHyde: boolean;
  enableMultiQuery: boolean;
  enableMMR: boolean;
  enableCompression: boolean;
  backendUrl: string;
}

const STORAGE_KEY = 'webrag-settings'
const DEFAULT: Settings = {
  openrouterKey: process.env.NEXT_PUBLIC_OPENROUTER_KEY || '',
  youtubeDataKey: process.env.NEXT_PUBLIC_YOUTUBE_DATA_API_KEY || 'AIzaSyBOCe23nKICUkhoUVSC8jh9KieK8VTs6gc',
  model: 'openrouter/free',
  topK: 5,
  chunkSize: 512,
  
  // Backend defaults
  llmProvider: 'openrouter',
  ollamaModel: 'llama3.1',
  ollamaUrl: 'http://localhost:11434',
  openaiKey: '',
  openaiModel: 'gpt-4o-mini',
  enableHyde: true,
  enableMultiQuery: false,
  enableMMR: true,
  enableCompression: true,
  backendUrl: 'http://localhost:8000',
}

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(DEFAULT)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
  // eslint-disable-next-line react-hooks/set-state-in-effect
        setSettingsState({ ...DEFAULT, ...JSON.parse(stored) })
      }
    } catch { /* ignore */ }
    setLoaded(true)
  }, [])

  const setSettings = useCallback(async (s: Settings) => {
    setSettingsState(s)
    
    // Save to local storage
    try { 
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) 
    } catch { /* ignore */ }

    // Sync settings to python backend
    try {
      await updateBackendSettings({
        llm_provider: s.llmProvider,
        ollama_model: s.ollamaModel,
        ollama_url: s.ollamaUrl,
        openai_key: s.openaiKey,
        openai_model: s.openaiModel,
        openrouter_key: s.openrouterKey,
        enable_hyde: s.enableHyde,
        enable_multi_query: s.enableMultiQuery,
        enable_mmr: s.enableMMR,
        enable_compression: s.enableCompression,
      })
      console.log('[WebRAG] Settings synced successfully to Python backend.')
    } catch (err) {
      console.warn('[WebRAG] Could not sync settings to Python backend (is it running?):', err)
    }
  }, [])

  return { settings, setSettings, loaded }
}
