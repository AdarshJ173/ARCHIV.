export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

export function normalizeVector(v: Float32Array): Float32Array {
  let norm = 0
  for (let i = 0; i < v.length; i++) {
    norm += v[i] * v[i]
  }
  norm = Math.sqrt(norm)
  if (norm === 0) return v
  const result = new Float32Array(v.length)
  for (let i = 0; i < v.length; i++) {
    result[i] = v[i] / norm
  }
  return result
}

export function vectorSearch(
  queryVec: Float32Array,
  vectors: Array<{ id: string; embedding: Float32Array }>,
  topK: number
): Array<{ id: string; score: number }> {
  const scores: Array<{ id: string; score: number }> = []

  for (const vec of vectors) {
    const sim = cosineSimilarity(queryVec, vec.embedding)
    scores.push({ id: vec.id, score: sim })
  }

  return scores.sort((a, b) => b.score - a.score).slice(0, topK)
}

export function rrf(
  rankedLists: string[][],
  k = 60
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>()
  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const docId = list[rank]
      scores.set(docId, (scores.get(docId) || 0) + 1 / (k + rank + 1))
    }
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ id, score }))
}
