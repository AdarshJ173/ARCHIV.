'use client'

import type { ChatMessage } from '@/types'
import type { TokenStats } from '@/hooks/useSearch'
import ChatInterface from './ChatInterface'

interface Props {
  messages: ChatMessage[]
  onSend: (question: string) => Promise<void>
  searching: boolean
  onStop?: () => void
  attachedFiles: string[]
  onAttachContext: () => void
  tokenStats: TokenStats
}

export default function ChatPanel({ messages, onSend, searching, onStop, attachedFiles, onAttachContext, tokenStats }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--card)',
      }}>
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--foreground)' }}>
          Research Session
        </span>
        <span className="model-info">
          RAG + Hybrid Search
        </span>
      </div>
      <ChatInterface
        messages={messages}
        onSend={onSend}
        searching={searching}
        onStop={onStop}
        attachedFiles={attachedFiles}
        onAttachContext={onAttachContext}
        tokenStats={tokenStats}
      />
    </div>
  )
}