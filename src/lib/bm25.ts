const K1 = 1.5
const B = 0.75

function tokenize(text: string): string[] {
  return text
    .replace(/[^\w\s]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0)
}

export interface Bm25Index {
  avgDocLen: number
  docCount: number
  docLengths: Map<string, number>
  termFreqs: Map<string, Map<string, number>>
  idf: Map<string, number>
}

export function buildBm25Index(
  docs: { id: string; text: string }[]
): Bm25Index {
  const tStart = performance.now()
  const docLengths = new Map<string, number>()
  const termFreqs = new Map<string, Map<string, number>>()
  const docCount = docs.length
  let totalLen = 0

  for (const doc of docs) {
    const tokens = tokenize(doc.text)
    docLengths.set(doc.id, tokens.length)
    totalLen += tokens.length

    const freq = new Map<string, number>()
    for (const t of tokens) {
      freq.set(t, (freq.get(t) || 0) + 1)
    }
    for (const [term, count] of freq) {
      if (!termFreqs.has(term)) {
        termFreqs.set(term, new Map())
      }
      termFreqs.get(term)!.set(doc.id, count)
    }
  }

  const avgDocLen = docCount > 0 ? totalLen / docCount : 0

  const idf = new Map<string, number>()
  let termCount = 0
  for (const [term, docsWithTerm] of termFreqs) {
    const df = docsWithTerm.size
    idf.set(term, Math.log(1 + (docCount - df + 0.5) / (df + 0.5)))
    termCount++
    if (termCount % 5000 === 0) {
      console.log(`[WebRAG:BM25] Computing IDF: ${termCount}/${termFreqs.size} terms [${((performance.now()-tStart)/1000).toFixed(1)}s]`)
    }
  }

  console.log(`[WebRAG:BM25] Index built: ${termCount} terms, ${docs.length} docs [${((performance.now()-tStart)/1000).toFixed(1)}s]`)
  return { avgDocLen, docCount, docLengths, termFreqs, idf }
}

export function bm25Search(
  index: Bm25Index,
  query: string,
  topK: number
): Array<{ id: string; score: number }> {
  const t = performance.now()
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return []

  const scores = new Map<string, number>()

  for (const term of queryTokens) {
    const idf = index.idf.get(term) || 0
    const termDocs = index.termFreqs.get(term)
    if (!termDocs) continue
    for (const [docId, tf] of termDocs) {
      const docLen = index.docLengths.get(docId) || 0
      const score = idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (docLen / index.avgDocLen))))
      scores.set(docId, (scores.get(docId) || 0) + score)
    }
  }

  const results = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id, score]) => ({ id, score }))

  console.log(`[WebRAG:BM25] Search: ${results.length} results in ${(performance.now()-t).toFixed(0)}ms [query: "${query.substring(0,40)}..."]`)
  return results
}

export function bm25IndexToTerms(
  index: Bm25Index
): Array<{ term: string; docFreqs: Record<string, number> }> {
  const tStart = performance.now()
  const terms: Array<{ term: string; docFreqs: Record<string, number> }> = []
  let count = 0
  for (const [term, docMap] of index.termFreqs) {
    const freqs: Record<string, number> = {}
    for (const [docId, count] of docMap) {
      freqs[docId] = count
    }
    terms.push({ term, docFreqs: freqs })
    count++
    if (count % 5000 === 0) {
      console.log(`[WebRAG:BM25] Serializing: ${count}/${index.termFreqs.size} terms [${((performance.now()-tStart)/1000).toFixed(1)}s]`)
    }
  }
  console.log(`[WebRAG:BM25] Serialized ${terms.length} terms for DB [${((performance.now()-tStart)/1000).toFixed(1)}s]`)
  return terms
}
