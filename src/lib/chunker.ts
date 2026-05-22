const ABBREVIATIONS = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Ave|Blvd|vs|etc|dept|est|govt|inc|ltd|co|corp|gen|sgt|capt|lt|col|maj|rep|sen|gov|univ|assn|bldg|mt|ft|hr|min|sec|vol|no|fig|eq|ch|p|pp|al|ca|approx|dept|est|natl|intl|info|orig|temp|demo|info|intro|max|min|avg|est|org|edu|gov|com)\b\./gi

export interface ChunkInput {
  id: string
  text: string
  fileName: string
}

export interface ChunkOutput {
  id: string
  text: string
  source: string
  chunkIndex: number
  fileId: string
}

function approximateTokenCount(text: string): number {
  return Math.ceil(text.length / 4)
}

export function sentenceChunks(
  text: string,
  maxTokens = 512,
  overlapTokens = 102,
  minChunkChars = 50
): string[] {
  const processed = text.replace(ABBREVIATIONS, (m) => m.replace('.', '<ABBRDOT>'))
  const rawSentences = processed.split(/(?<=[.!?\n])\s*/)
  const sentences = rawSentences
    .map((s) => s.trim().replace(/<ABBRDOT>/g, '.'))
    .filter((s) => s.length > 0)

  if (sentences.length === 0) return []

  const sentTokens = sentences.map((s) => approximateTokenCount(s))
  const chunks: string[] = []
  let i = 0
  const n = sentences.length

  while (i < n) {
    let total = 0
    let j = i
    while (j < n && total + sentTokens[j] <= maxTokens) {
      total += sentTokens[j]
      j++
    }

    if (j === i) {
      const oversized = sentences[i]
      const maxChars = maxTokens * 4
      let start = 0
      while (start < oversized.length) {
        const end = Math.min(start + maxChars, oversized.length)
        const seg = oversized.slice(start, end).trim()
        if (seg.length >= minChunkChars) chunks.push(seg)
        start = end - Math.floor(overlapTokens * 4)
        if (start < 0) start = 0
      }
      i++
      continue
    }

    const chunkText = sentences.slice(i, j).join(' ')
    if (chunkText.length >= minChunkChars) {
      chunks.push(chunkText)
    }

    if (j >= n) break

    let overlap = 0
    let k = j - 1
    while (k > i && overlap < overlapTokens) {
      overlap += sentTokens[k]
      k--
    }
    i = overlap >= overlapTokens ? k + 1 : i + 1
    if (i >= j) i = j
  }

  return chunks
}

export function chunkFiles(
  files: ChunkInput[],
  options?: { maxTokens?: number; overlapTokens?: number }
): ChunkOutput[] {
  const maxTokens = options?.maxTokens ?? 512
  const overlapTokens = options?.overlapTokens ?? Math.round(maxTokens * 0.2)
  const tStart = performance.now()
  const results: ChunkOutput[] = []
  for (const file of files) {
    const t = performance.now()
    const chunks = sentenceChunks(file.text, maxTokens, overlapTokens)
    console.log(`[WebRAG:Chunker] "${file.fileName}": ${chunks.length} chunks from ${file.text.length} chars [${(performance.now()-t).toFixed(0)}ms]`)
    for (let idx = 0; idx < chunks.length; idx++) {
      results.push({
        id: `${file.id}_${idx}`,
        text: chunks[idx],
        source: file.fileName,
        chunkIndex: idx,
        fileId: file.id,
      })
    }
  }
  console.log(`[WebRAG:Chunker] Total: ${results.length} chunks from ${files.length} files [${(performance.now()-tStart).toFixed(0)}ms]`)
  return results
}
