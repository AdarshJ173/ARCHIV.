'use client'

import { useState, useEffect } from 'react'
import { useSettings } from '@/hooks/useSettings'
import { Key, X, ExternalLink, Eye, EyeOff } from 'lucide-react'

const models = [
  { id: 'openrouter/free', name: 'Auto: Best Free Model' },
  { id: 'openai/gpt-oss-120b:free', name: 'GPT-OSS 120B (free)' },
  { id: 'openai/gpt-oss-20b:free', name: 'GPT-OSS 20B (free)' },
  { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (free)' },
  { id: 'deepseek/deepseek-v4-flash:free', name: 'DeepSeek V4 Flash (free)' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)' },
  { id: 'meta-llama/llama-3.2-3b-instruct:free', name: 'Llama 3.2 3B (free)' },
  { id: 'qwen/qwen3-coder:free', name: 'Qwen3 Coder 480B (free)' },
  { id: 'qwen/qwen-2.5-7b-instruct:free', name: 'Qwen 2.5 7B (free)' },
  { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B (free)' },
  { id: 'google/gemini-2.0-flash-001:free', name: 'Gemini 2.0 Flash (free)' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super 120B (free)' },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free', name: 'Nemotron 3 Nano 30B (free)' },
  { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B (free)' },
  { id: 'minimax/minimax-m2.5:free', name: 'MiniMax M2.5 (free)' },
  { id: 'arcee-ai/trinity-large-thinking:free', name: 'Trinity Large Thinking (free)' },
  { id: 'nousresearch/hermes-3-llama-3.1-405b:free', name: 'Hermes 3 405B (free)' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (paid)' },
  { id: 'openai/gpt-4o', name: 'GPT-4o (paid)' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (paid)' },
]

interface Props {
  onClose: () => void
}

export default function SettingsDialog({ onClose }: Props) {
  const { settings, setSettings, loaded } = useSettings()
  const [local, setLocal] = useState({ ...settings })
  const [showKey, setShowKey] = useState(false)
  const [showYtKey, setShowYtKey] = useState(false)

  useEffect(() => {
    if (loaded) setLocal({ ...settings })
  }, [loaded])

  const handleSave = () => {
    setSettings(local)
    onClose()
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal animate-slide-up">
        <div className="modal-header">
          <h2 className="modal-title">Settings</h2>
          <button className="modal-close" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="modal-body">
          <div className="settings-section">
            <div className="settings-section-title">
              <Key className="h-4 w-4" />
              OpenRouter API Key
            </div>
            <div className="settings-section-desc">
              Required for LLM responses. Your key is stored locally and never sent to our servers.
            </div>
            <div className="settings-field">
              <label className="settings-label" htmlFor="or-key">API Key</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="or-key"
                  className="settings-input"
                  type={showKey ? 'text' : 'password'}
                  placeholder="sk-or-v1-..."
                  value={local.openrouterKey}
                  onChange={(e) => setLocal(prev => ({ ...prev, openrouterKey: e.target.value }))}
                  style={{ paddingRight: '36px' }}
                />
                <button
                  onClick={() => setShowKey(prev => !prev)}
                  style={{
                    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '4px',
                  }}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="settings-hint">
                <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">
                  Get a key <ExternalLink className="h-3 w-3 inline" />
                </a>
              </div>
            </div>
            <div className="settings-field">
              <label className="settings-label" htmlFor="model-select">Default Model</label>
              <select
                id="model-select"
                className="settings-select"
                value={local.model || 'openai/gpt-4o-mini'}
                onChange={(e) => setLocal(prev => ({ ...prev, model: e.target.value }))}
              >
                {models.map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">
              <Key className="h-4 w-4" />
              YouTube Data API Key
            </div>
            <div className="settings-section-desc">
              Required for listing channel videos. Free tier: 10,000 quota units/day.
            </div>
            <div className="settings-field">
              <label className="settings-label" htmlFor="yt-key">API Key</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="yt-key"
                  className="settings-input"
                  type={showYtKey ? 'text' : 'password'}
                  placeholder="AIzaSy..."
                  value={local.youtubeDataKey}
                  onChange={(e) => setLocal(prev => ({ ...prev, youtubeDataKey: e.target.value }))}
                  style={{ paddingRight: '36px' }}
                />
                <button
                  onClick={() => setShowYtKey(prev => !prev)}
                  style={{
                    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '4px',
                  }}
                >
                  {showYtKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="settings-hint">
                <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">
                  Google Cloud Console <ExternalLink className="h-3 w-3 inline" />
                </a>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">
              RAG Parameters
            </div>
            <div className="settings-section-desc">
              Control how the retrieval-augmented generation searches and processes your documents.
            </div>
            <div className="settings-field">
              <label className="settings-label" htmlFor="top-k">Top-K Results</label>
              <input
                id="top-k"
                className="settings-input"
                type="number"
                min={1}
                max={20}
                value={local.topK ?? 5}
                onChange={(e) => setLocal(prev => ({ ...prev, topK: parseInt(e.target.value) || 5 }))}
                style={{ fontFamily: 'var(--font-mono)' }}
              />
              <div className="settings-hint">Number of relevant chunks to retrieve (1-20)</div>
            </div>
            <div className="settings-field">
              <label className="settings-label" htmlFor="chunk-size">Chunk Size</label>
              <input
                id="chunk-size"
                className="settings-input"
                type="number"
                min={128}
                max={2048}
                step={128}
                value={local.chunkSize ?? 512}
                onChange={(e) => setLocal(prev => ({ ...prev, chunkSize: parseInt(e.target.value) || 512 }))}
                style={{ fontFamily: 'var(--font-mono)' }}
              />
              <div className="settings-hint">Characters per chunk (128-2048)</div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
        </div>
      </div>
    </div>
  )
}
