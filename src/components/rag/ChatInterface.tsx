'use client'

import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '@/types'
import type { TokenStats } from '@/hooks/useSearch'
import { getSystemPrompt, getPromptEngineeringSummary } from '@/lib/openrouter'
import { Bot, Send, Loader2, FileText, Sparkles, Lightbulb, Search, MessageSquare, AlertCircle, Square, Copy, Check, Info } from 'lucide-react'

interface Props {
  messages: ChatMessage[]
  onSend: (question: string) => Promise<void>
  searching: boolean
  onStop?: () => void
  attachedFiles: string[]
  onAttachContext: () => void
  tokenStats: TokenStats
}

const suggestions = [
  'Summarize the key points from my transcripts',
  'What are the main topics covered?',
  'Find information about...',
]

const thinkingStages = [
  { id: 'search', label: 'Searching transcripts', icon: Search },
  { id: 'analyze', label: 'Analyzing context', icon: Lightbulb },
  { id: 'reason', label: 'Reasoning', icon: Sparkles },
  { id: 'respond', label: 'Generating response', icon: MessageSquare },
]

export default function ChatInterface({ messages, onSend, searching, onStop, attachedFiles, onAttachContext, tokenStats }: Props) {
  const [input, setInput] = useState('')
  const [activeThinkingStage, setActiveThinkingStage] = useState(0)
  const [showPromptInfo, setShowPromptInfo] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const hasContext = attachedFiles.length > 0

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    if (!searching) return
    const resetTimer = setTimeout(() => setActiveThinkingStage(0), 0)
    const interval = setInterval(() => {
      setActiveThinkingStage(prev => Math.min(prev + 1, thinkingStages.length - 1))
    }, 2000)
    return () => {
      clearTimeout(resetTimer)
      clearInterval(interval)
    }
  }, [searching])

  const handleSend = () => {
    const q = input.trim()
    if (!q || searching) return
    setInput('')
    onSend(q)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    setInput(el.value)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {hasContext ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
          padding: '6px 16px', borderBottom: '1px solid var(--border)',
          background: 'rgba(45, 107, 63, 0.04)',
        }}>
          <FileText className="h-3 w-3" style={{ color: 'var(--success)' }} />
          <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>Context:</span>
          {attachedFiles.map((f, i) => (
            <span key={i} className="source-badge">
              {f}
            </span>
          ))}
        </div>
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
          padding: '8px 16px', borderBottom: '1px solid var(--border)',
          background: 'rgba(154, 123, 47, 0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertCircle className="h-3.5 w-3.5" style={{ color: 'var(--warning)' }} />
            <span style={{ fontSize: '11px', color: 'var(--muted-foreground)' }}>
              No context attached. Select files to use for this chat session.
            </span>
          </div>
          <button className="btn btn-sm btn-accent" onClick={onAttachContext}>
            <FileText className="h-3 w-3" />
            Attach Context
          </button>
        </div>
      )}

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
        {messages.length === 0 ? (
          <div className="empty-state">
            <Bot className="empty-icon" />
            <div className="empty-text">
              {hasContext ? 'Ask about your transcripts' : 'Attach context to get started'}
            </div>
            <div className="empty-hint">
              {hasContext
                ? 'Responses include source citations from your knowledge library'
                : 'Click "Attach Context" above to select indexed files or upload new ones'}
            </div>
          </div>
        ) : (
          <div>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {searching && (
              <div className="thinking">
                <div className="chat-avatar assistant" style={{ width: '28px', height: '28px', fontSize: '11px' }}>
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="thinking-stages">
                  {thinkingStages.map((stage, i) => {
                    let stageStatus = 'pending'
                    if (i < activeThinkingStage) stageStatus = 'complete'
                    else if (i === activeThinkingStage) stageStatus = 'active'
                    return (
                      <div key={stage.id} className={`thinking-stage ${stageStatus}`}>
                        {stageStatus === 'complete' ? (
                          <Loader2 className="thinking-spinner" style={{ borderColor: 'var(--success)', borderTopColor: 'var(--success)' }} />
                        ) : (
                          <div className="thinking-spinner" />
                        )}
                        {stage.label}
                      </div>
                    )
                  })}
                </div>
                <button
                  className="btn btn-sm"
                  onClick={onStop}
                  title="Stop generating"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    color: 'var(--foreground)', background: 'var(--muted)',
                    border: '1px solid var(--border)', borderRadius: '6px',
                    padding: '4px 10px', cursor: 'pointer', fontSize: '11px',
                    marginLeft: 'auto',
                  }}
                >
                  <Square className="h-3 w-3" fill="currentColor" />
                  Stop
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {messages.length === 0 && !searching && hasContext && (
        <div className="suggestion-chips">
          {suggestions.map((s, i) => (
            <button
              key={i}
              className="suggestion-chip"
              onClick={() => { setInput(''); onSend(s) }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder={hasContext ? 'Ask a question about your transcripts...' : 'Attach context to start chatting'}
            value={input}
            onChange={autoResize}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={!hasContext}
          />
          <button
            className="btn btn-primary"
            onClick={hasContext ? handleSend : onAttachContext}
            disabled={hasContext ? (!input.trim() || searching) : false}
          >
            {!hasContext ? (
              <FileText className="h-4 w-4" />
            ) : searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        {tokenStats.requestCount > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '4px 16px', fontSize: '10px', color: 'var(--muted-foreground)',
            borderTop: '1px solid var(--border)', background: 'var(--card)',
          }}>
            <Info
              className="h-3 w-3"
              style={{ cursor: 'pointer', color: showPromptInfo ? 'var(--accent-rust)' : undefined }}
              onClick={() => setShowPromptInfo(!showPromptInfo)}
            />
            <span>{tokenStats.requestCount} request{tokenStats.requestCount !== 1 ? 's' : ''}</span>
            <span>{tokenStats.totalTokens.toLocaleString()} total tokens</span>
            <span>~{Math.round(tokenStats.totalTokens / tokenStats.requestCount).toLocaleString()} avg/req</span>
            <span style={{ marginLeft: 'auto' }}>
              {tokenStats.totalPrompt.toLocaleString()} in / {tokenStats.totalCompletion.toLocaleString()} out
            </span>
          </div>
        )}
        {showPromptInfo && (
          <div style={{
            padding: '10px 16px', fontSize: '11px', lineHeight: '1.6',
            borderTop: '1px solid var(--border)', background: 'var(--muted)',
            maxHeight: '200px', overflowY: 'auto', fontFamily: 'var(--font-mono)',
            whiteSpace: 'pre-wrap', color: 'var(--muted-foreground)',
          }}>
            System prompt:{'\n'}
            {getSystemPrompt()}{'\n\n'}
            Prompt engineering:{'\n'}
            {getPromptEngineeringSummary()}
          </div>
        )}
      </div>
    </div>
  )
}

type PropsWithChildren = { children?: React.ReactNode }

const markdownComponents = {
  h1: ({ children }: PropsWithChildren) => <h1 style={{ fontSize: '18px', fontWeight: 600, marginTop: '16px', marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid var(--border)' }}>{children}</h1>,
  h2: ({ children }: PropsWithChildren) => <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '12px', marginBottom: '6px' }}>{children}</h2>,
  h3: ({ children }: PropsWithChildren) => <h3 style={{ fontSize: '14px', fontWeight: 600, marginTop: '8px', marginBottom: '4px' }}>{children}</h3>,
  p: ({ children }: PropsWithChildren) => <p style={{ marginBottom: '8px', lineHeight: '1.65' }}>{children}</p>,
  ul: ({ children }: PropsWithChildren) => <ul style={{ listStyle: 'disc', paddingLeft: '20px', marginBottom: '8px' }}>{children}</ul>,
  ol: ({ children }: PropsWithChildren) => <ol style={{ listStyle: 'decimal', paddingLeft: '20px', marginBottom: '8px' }}>{children}</ol>,
  li: ({ children }: PropsWithChildren) => <li style={{ marginBottom: '4px', lineHeight: '1.6' }}>{children}</li>,
  strong: ({ children }: PropsWithChildren) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
  em: ({ children }: PropsWithChildren) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
  code: ({ children, ...props }: React.ComponentPropsWithoutRef<'code'>) => {
    return <code style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '1px 5px', background: 'var(--muted)', borderRadius: '3px' }} {...props}>{children}</code>
  },
  pre: ({ children }: PropsWithChildren) => <>{children}</>,
  blockquote: ({ children }: PropsWithChildren) => <blockquote style={{ borderLeft: '3px solid var(--border)', paddingLeft: '12px', margin: '8px 0', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>{children}</blockquote>,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-rust)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>{children}</a>,
  hr: () => <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid var(--border)' }} />,
  table: ({ children }: PropsWithChildren) => <div style={{ overflowX: 'auto', marginBottom: '8px' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>{children}</table></div>,
  thead: ({ children }: PropsWithChildren) => <thead style={{ background: 'var(--muted)' }}>{children}</thead>,
  th: ({ children }: PropsWithChildren) => <th style={{ border: '1px solid var(--border)', padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>{children}</th>,
  td: ({ children }: PropsWithChildren) => <td style={{ border: '1px solid var(--border)', padding: '6px 10px' }}>{children}</td>,
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
    }
  }

  return (
    <div className={`chat-msg ${isUser ? 'user' : 'assistant'}`}>
      <div className={`chat-avatar ${isUser ? 'user' : 'assistant'}`}>
        {isUser ? 'You' : <Bot className="h-4 w-4" />}
      </div>
      <div className="chat-content">
        <div className="chat-text">
          {isUser ? (
            <div>{message.content}</div>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
          {!isUser && (
            <button
              onClick={handleCopy}
              title={copied ? 'Copied!' : 'Copy formatted response'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '2px 6px', fontSize: '10px', color: 'var(--muted-foreground)',
                background: 'none', border: '1px solid var(--border)', borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
          {message.sources && message.sources.length > 0 && (
            <div className="chat-source">
              {message.sources.map((s, i) => (
                <span key={i} className="source-badge">
                  <FileText className="h-3 w-3" />
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
        {message.model && (
          <div className="chat-model">{message.model}</div>
        )}
      </div>
    </div>
  )
}