'use client'

import { useState, useEffect } from 'react'
import { useSettings, type Settings } from '@/hooks/useSettings'
import { getHealth, BACKEND_URL } from '@/lib/api'
import { Key, X, ExternalLink, Eye, EyeOff, Cpu, Zap, ToggleLeft, ToggleRight, Server, CheckCircle, AlertTriangle } from 'lucide-react'

interface Props {
  onClose: () => void
}

export default function SettingsDialog({ onClose }: Props) {
  const { settings, setSettings, loaded } = useSettings()
  const [local, setLocal] = useState({ ...settings })
  const [showKey, setShowKey] = useState(false)
  const [showOpenaiKey, setShowOpenaiKey] = useState(false)
  const [showYtKey, setShowYtKey] = useState(false)
  
  // Backend health status state
  const [backendHealth, setBackendHealth] = useState<{
    connected: boolean;
    status?: string;
    device?: string;
    gpu_name?: string;
    total_files?: number;
    total_chunks?: number;
    models_loaded?: string[];
  }>({ connected: false })

  useEffect(() => {
    if (loaded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocal({ ...settings })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  // Poll backend health on settings dialog open
  useEffect(() => {
    let active = true;
    async function checkHealth() {
      try {
        const data = await getHealth()
        if (active) {
          setBackendHealth({
            connected: true,
            status: data.status,
            device: data.device,
            gpu_name: data.gpu_name || undefined,
            total_files: data.total_files,
            total_chunks: data.total_chunks,
            models_loaded: data.models_loaded
          })
        }
      } catch {
        if (active) {
          setBackendHealth({ connected: false })
        }
      }
    }
    checkHealth()
    const timer = setInterval(checkHealth, 3000)
    return () => {
      active = false;
      clearInterval(timer)
    }
  }, [])

  const handleSave = () => {
    // If provider is openrouter, sync default model
    let model = local.model
    if (local.llmProvider === 'openrouter') {
      model = local.model || 'openrouter/free'
    } else if (local.llmProvider === 'ollama') {
      model = local.ollamaModel
    } else if (local.llmProvider === 'openai') {
      model = local.openaiModel
    }
    
    setSettings({ ...local, model })
    onClose()
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal animate-slide-up" style={{ maxWidth: '600px', width: '90%' }}>
        <div className="modal-header">
          <h2 className="modal-title">Settings</h2>
          <button className="modal-close" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
          {/* Backend Connection Health */}
          <div className="settings-section" style={{
            background: backendHealth.connected ? 'rgba(45, 107, 63, 0.04)' : 'rgba(217, 83, 79, 0.04)',
            border: `1px solid ${backendHealth.connected ? 'rgba(45, 107, 63, 0.2)' : 'rgba(217, 83, 79, 0.2)'}`,
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13px' }}>
                <Server className="h-4 w-4" style={{ color: backendHealth.connected ? 'var(--success)' : 'var(--danger)' }} />
                Ultimate RAG Backend status
              </div>
              <span style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontWeight: 600,
                background: backendHealth.connected ? 'rgba(45, 107, 63, 0.15)' : 'rgba(217, 83, 79, 0.15)',
                color: backendHealth.connected ? 'var(--success)' : 'var(--danger)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                {backendHealth.connected ? (
                  <><CheckCircle className="h-3 w-3" /> Connected</>
                ) : (
                  <><AlertTriangle className="h-3 w-3" /> Offline</>
                )}
              </span>
            </div>
            {backendHealth.connected ? (
              <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                <div>Device: <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{backendHealth.device?.toUpperCase()} {backendHealth.gpu_name ? `(${backendHealth.gpu_name})` : ''}</span></div>
                <div>Library: <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{backendHealth.total_files} files / {backendHealth.total_chunks} chunks</span></div>
                <div>Loaded: <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{backendHealth.models_loaded?.join(', ') || 'None'}</span></div>
              </div>
            ) : (
              <div style={{ fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '6px' }}>
                FastAPI backend is offline at <code style={{ fontSize: '10px' }}>{BACKEND_URL}</code>. Run <code style={{ fontSize: '10px' }}>npm run dev</code> to automatically launch it with GPU/CPU acceleration.
              </div>
            )}
          </div>

          {/* LLM Provider Configuration */}
          <div className="settings-section">
            <div className="settings-section-title">
              <Cpu className="h-4 w-4" />
              LLM Generation Provider
            </div>
            <div className="settings-section-desc">
              Select your AI model provider. You can use free web models, local offline models, or standard OpenAI APIs.
            </div>

            <div className="settings-field">
              <label className="settings-label" htmlFor="provider-select">AI Provider</label>
              <select
                id="provider-select"
                className="settings-select"
                value={local.llmProvider}
                onChange={(e) => setLocal(prev => ({ ...prev, llmProvider: e.target.value as Settings['llmProvider'] }))}
              >
                <option value="openrouter">OpenRouter (Cloud LLMs & Free Models)</option>
                <option value="ollama">Ollama (Fully Local Offline LLMs)</option>
                <option value="openai">OpenAI (Direct API)</option>
              </select>
            </div>

            {/* OpenRouter Inputs */}
            {local.llmProvider === 'openrouter' && (
              <>
                <div className="settings-field animate-fade-in">
                  <label className="settings-label" htmlFor="or-key">OpenRouter API Key (Optional)</label>
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
                  <div className="settings-hint" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Leave empty to use automatic rate-limited free models</span>
                    <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">
                      Get an OpenRouter Key <ExternalLink className="h-3 w-3 inline" />
                    </a>
                  </div>
                </div>

                <div className="settings-field animate-fade-in">
                  <label className="settings-label" htmlFor="model-select">Preferred Model</label>
                  <input
                    id="model-select"
                    className="settings-input"
                    type="text"
                    placeholder="openrouter/free"
                    value={local.model}
                    onChange={(e) => setLocal(prev => ({ ...prev, model: e.target.value }))}
                  />
                  <div className="settings-hint">
                    Model identifier from OpenRouter (e.g. <code>deepseek/deepseek-r1:free</code>)
                  </div>
                </div>
              </>
            )}

            {/* Ollama Inputs */}
            {local.llmProvider === 'ollama' && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="settings-field">
                  <label className="settings-label" htmlFor="ollama-url">Ollama Base URL</label>
                  <input
                    id="ollama-url"
                    className="settings-input"
                    type="text"
                    placeholder="http://localhost:11434"
                    value={local.ollamaUrl}
                    onChange={(e) => setLocal(prev => ({ ...prev, ollamaUrl: e.target.value }))}
                  />
                  <div className="settings-hint">
                    Make sure Ollama app is running locally.
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-label" htmlFor="ollama-model">Local Model Name</label>
                  <input
                    id="ollama-model"
                    className="settings-input"
                    type="text"
                    placeholder="llama3.1"
                    value={local.ollamaModel}
                    onChange={(e) => setLocal(prev => ({ ...prev, ollamaModel: e.target.value }))}
                  />
                  <div className="settings-hint">
                    Must match a model you have pulled in Ollama (e.g. <code>llama3.1</code>, <code>mistral</code>, <code>qwen2.5:7b</code>)
                  </div>
                </div>
              </div>
            )}

            {/* OpenAI Inputs */}
            {local.llmProvider === 'openai' && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="settings-field">
                  <label className="settings-label" htmlFor="openai-key">OpenAI API Key</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="openai-key"
                      className="settings-input"
                      type={showOpenaiKey ? 'text' : 'password'}
                      placeholder="sk-..."
                      value={local.openaiKey}
                      onChange={(e) => setLocal(prev => ({ ...prev, openaiKey: e.target.value }))}
                      style={{ paddingRight: '36px' }}
                    />
                    <button
                      onClick={() => setShowOpenaiKey(prev => !prev)}
                      style={{
                        position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '4px',
                      }}
                    >
                      {showOpenaiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="settings-hint" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Stored securely in local memory</span>
                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
                      Get key <ExternalLink className="h-3 w-3 inline" />
                    </a>
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-label" htmlFor="openai-model">OpenAI Model</label>
                  <input
                    id="openai-model"
                    className="settings-input"
                    type="text"
                    placeholder="gpt-4o-mini"
                    value={local.openaiModel}
                    onChange={(e) => setLocal(prev => ({ ...prev, openaiModel: e.target.value }))}
                  />
                  <div className="settings-hint">
                    Standard model like <code>gpt-4o-mini</code> or <code>gpt-4o</code>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Advanced Search Pipeline Toggles */}
          <div className="settings-section">
            <div className="settings-section-title">
              <Zap className="h-4 w-4" />
              Advanced Retrieval Techniques (Hybrid RAG)
            </div>
            <div className="settings-section-desc">
              Enable advanced algorithmic retrieval options inspired by state-of-the-art frameworks.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
              {/* HyDE Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600 }}>Hypothetical Document Embedding (HyDE)</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Generates a hypothetical answer, then embeds that to perform vector search. Improves semantic matching.</div>
                </div>
                <button
                  onClick={() => setLocal(prev => ({ ...prev, enableHyde: !prev.enableHyde }))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {local.enableHyde ? (
                    <ToggleRight className="h-7 w-7" style={{ color: 'var(--success)' }} />
                  ) : (
                    <ToggleLeft className="h-7 w-7" style={{ color: 'var(--muted-foreground)' }} />
                  )}
                </button>
              </div>

              {/* Multi Query Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600 }}>Multi-Query Decomposition</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Breaks down complex questions into 2-3 simpler sub-queries. Searches all and merges results.</div>
                </div>
                <button
                  onClick={() => setLocal(prev => ({ ...prev, enableMultiQuery: !prev.enableMultiQuery }))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {local.enableMultiQuery ? (
                    <ToggleRight className="h-7 w-7" style={{ color: 'var(--success)' }} />
                  ) : (
                    <ToggleLeft className="h-7 w-7" style={{ color: 'var(--muted-foreground)' }} />
                  )}
                </button>
              </div>

              {/* MMR Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600 }}>MMR Diversification</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Maximal Marginal Relevance reduces redundancy in contexts, ensuring distinct source parts.</div>
                </div>
                <button
                  onClick={() => setLocal(prev => ({ ...prev, enableMMR: !prev.enableMMR }))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {local.enableMMR ? (
                    <ToggleRight className="h-7 w-7" style={{ color: 'var(--success)' }} />
                  ) : (
                    <ToggleLeft className="h-7 w-7" style={{ color: 'var(--muted-foreground)' }} />
                  )}
                </button>
              </div>

              {/* Context Compression Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600 }}>Sentence-Window Context Expansion</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Retrieves precise sentences, but automatically expands to ±2 adjacent sentence windows for generation.</div>
                </div>
                <button
                  onClick={() => setLocal(prev => ({ ...prev, enableCompression: !prev.enableCompression }))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {local.enableCompression ? (
                    <ToggleRight className="h-7 w-7" style={{ color: 'var(--success)' }} />
                  ) : (
                    <ToggleLeft className="h-7 w-7" style={{ color: 'var(--muted-foreground)' }} />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* RAG Parameters */}
          <div className="settings-section">
            <div className="settings-section-title">
              Parameters & Sizing
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
              <div className="settings-hint">Number of context chunks to retrieve (1-20)</div>
            </div>
          </div>

          {/* YouTube Data Key */}
          <div className="settings-section">
            <div className="settings-section-title">
              <Key className="h-4 w-4" />
              YouTube Data API Key
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
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
        </div>
      </div>
    </div>
  )
}
