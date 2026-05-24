import { useState, useCallback, useRef } from 'react'
import type { ChatMessage } from '@/types'
import { searchAndStream, SearchOptions } from '@/lib/api'

export interface TokenStats {
  totalPrompt: number;
  totalCompletion: number;
  totalTokens: number;
  requestCount: number;
}

export function useSearch() {
  const [searching, setSearching] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  
  // Dummy stats to maintain interface compatibility
  const [tokenStats, _setTokenStats] = useState<TokenStats>({
    totalPrompt: 0,
    totalCompletion: 0,
    totalTokens: 0,
    requestCount: 0,
  })

  const search = useCallback(async (
    question: string,
    apiKey: string, // Kept for compatibility, though we read from backend setting / .env
    attachedFiles: string[],
    options: { model?: string; topK?: number; provider?: string },
    onToken: (token: string) => void,
    onSources: (sources: string[]) => void,
    onStatus?: (status: string) => void
  ): Promise<ChatMessage | null> => {
    
    // Abort active search
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    
    setSearching(true)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _tStart = performance.now()



    return new Promise((resolve) => {
      let accumulatedContent = ''
      let sourceNames: string[] = []

      const apiOptions: SearchOptions = {
        limit: options?.topK || 5,
        provider: options?.provider || 'openrouter',
        model: options?.model,
      }

      // Call API search and stream
      searchAndStream(
        question,
        apiOptions,
        (token) => {
          accumulatedContent += token
          onToken(token)
        },
        (sources) => {
          // Map back retrieved sources
          sourceNames = Array.from(new Set(sources.map(s => s.source)))
          onSources(sourceNames)
        },
        (status) => {
          onStatus?.(status)
        },
        () => {
          // Completed

          
          setSearching(false)
          if (abortRef.current === controller) abortRef.current = null
          
          resolve({
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: accumulatedContent,
            sources: sourceNames,
            model: options?.model || 'default',
            timestamp: Date.now()
          })
        },
        (error) => {
          // Error

          setSearching(false)
          if (abortRef.current === controller) abortRef.current = null
          
          onToken(`\n\n**Search Error:** ${error.message}`)
          resolve({
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: accumulatedContent + `\n\n**Search Error:** ${error.message}`,
            timestamp: Date.now()
          })
        },
        controller.signal
      )
    })
  }, [])

  const abortSearch = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setSearching(false)
  }, [])

  return { search, searching, abortSearch, tokenStats }
}