const FREE_MODELS = [
  'openai/gpt-oss-120b:free',
  'openrouter/free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'deepseek/deepseek-v4-flash:free',
]

export interface LLMResponse {
  answer: string
  model: string
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export async function queryLLM(
  prompt: string,
  apiKey: string,
  options?: { preferredModel?: string; onModelTry?: (model: string) => void; signal?: AbortSignal }
): Promise<LLMResponse> {
  const preferred = options?.preferredModel
  const modelsToTry = preferred
    ? [preferred, ...FREE_MODELS.filter(m => m !== preferred)]
    : FREE_MODELS

  for (const model of modelsToTry) {
    const t = performance.now()
    try {
      options?.onModelTry?.(model)
      console.log(`[WebRAG:LLM] Trying ${model}...`)
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'WebRAG',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 4096,
        }),
        signal: options?.signal ?? AbortSignal.timeout(60000),
      })

      const elapsed = performance.now() - t

      if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error')
        console.warn(`[WebRAG:LLM] ${model} failed after ${elapsed.toFixed(0)}ms: ${response.status} ${errText}`)
        continue
      }

      const data = await response.json()
      const answer = data.choices?.[0]?.message?.content
      if (answer) {
        console.log(`[WebRAG:LLM] ✓ ${model} responded in ${elapsed.toFixed(0)}ms (${answer.length} chars)`)
        const usage = data.usage
        let promptTokens: number | undefined
        let completionTokens: number | undefined
        let totalTokens: number | undefined
        if (usage) {
          promptTokens = usage.prompt_tokens || undefined
          completionTokens = usage.completion_tokens || undefined
          totalTokens = usage.total_tokens || undefined
          console.log(`[WebRAG:LLM]   Tokens: ${promptTokens ?? '?'} in → ${completionTokens ?? '?'} out (${totalTokens ?? '?'} total)`)
        }
        return { answer, model, promptTokens, completionTokens, totalTokens }
      }
    } catch (err) {
      const elapsed = performance.now() - t
      console.warn(`[WebRAG:LLM] ${model} error after ${elapsed.toFixed(0)}ms:`, err)
      if (options?.signal?.aborted) throw err
    }
  }

  console.warn(`[WebRAG:LLM] All ${FREE_MODELS.length} free models exhausted after multiple attempts`)
  return { answer: 'All free models are rate-limited. Please try again in a moment.', model: '' }
}

export function getSystemPrompt(): string {
  return (
    'You are an expert researcher. Answer using ONLY the provided transcript context.\n' +
    'Be detailed, accurate, and comprehensive.\n' +
    'Cite the specific source filename after each relevant statement in parentheses.\n' +
    'If the context does not contain the answer, say so — do not make up information.'
  )
}

export function getPromptEngineeringSummary(): string {
  return (
    '1. System-level instruction: ' + getSystemPrompt() + '\n\n' +
    '2. Context injection: Transcript chunks are injected between "Context:" and "Question:" markers\n\n' +
    '3. Source citation: Model is required to cite source filenames after claims\n\n' +
    '4. Temperature: 0.7 (balanced creativity/ determinism)\n\n' +
    '5. Max output tokens: 4096\n\n' +
    '6. Model fallback chain: ' + FREE_MODELS.join(', ') + '\n\n' +
    '7. Retrieval: Hybrid search (dense vector cosine similarity + BM25 keyword scoring, reranked by reciprocal rank fusion)'
  )
}

export function buildRagPrompt(
  question: string,
  contexts: Array<{ text: string; source: string }>
): string {
  const ctx = contexts
    .map((c) => `From ${c.source}:\n${c.text}`)
    .join('\n\n---\n\n')

  return (
    'You are an expert researcher. Answer using ONLY the provided transcript context.\n' +
    'Be detailed, accurate, and comprehensive.\n' +
    'Cite the specific source filename after each relevant statement in parentheses.\n' +
    'If the context does not contain the answer, say so — do not make up information.\n\n' +
    'Context:\n' +
    ctx +
    '\n\nQuestion: ' +
    question +
    '\n\nAnswer:'
  )
}
