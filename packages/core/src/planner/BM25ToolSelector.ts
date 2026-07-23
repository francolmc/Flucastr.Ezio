import type { Tool } from '../types/index'

const K1 = 1.5
const B = 0.75

export class BM25ToolSelector {
  select(objective: string, tools: Tool[], maxTools = 5): Tool[] {
    const filteredTools = tools.filter(t => !t.description.includes('DEPRECATED'))

    if (filteredTools.length === 0) {
      return []
    }

    const objectiveTokens = this.tokenize(objective)

    if (objectiveTokens.length === 0) {
      return filteredTools.slice(0, maxTools)
    }

    const docTokens = filteredTools.map(t => this.tokenize(`${t.name} ${t.description}`))
    const docLengths = docTokens.map(tokens => tokens.length)
    const avgDocLength = docLengths.reduce((a, b) => a + b, 0) / docLengths.length

    const termFreqs = docTokens.map(doc => this.computeTermFrequencies(doc))
    const idf = this.computeIDF(docTokens, objectiveTokens)

    const scores = filteredTools.map((_, i) => {
      return this.computeBM25(termFreqs[i], docLengths[i], avgDocLength, objectiveTokens, idf)
    })

    const maxScore = Math.max(...scores)

    if (maxScore === 0) {
      return filteredTools.slice(0, maxTools)
    }

    const indexedScores = scores.map((score, index) => ({ score, index }))
    indexedScores.sort((a, b) => b.score - a.score)

    return indexedScores
      .slice(0, maxTools)
      .map(({ index }) => filteredTools[index])
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[\s\p{P}]+/u)
      .filter(token => token.length > 0)
  }

  private computeTermFrequencies(tokens: string[]): Map<string, number> {
    const freq = new Map<string, number>()
    for (const token of tokens) {
      freq.set(token, (freq.get(token) ?? 0) + 1)
    }
    return freq
  }

  private computeIDF(docTokens: string[][], queryTokens: string[]): Map<string, number> {
    const idf = new Map<string, number>()
    const n = docTokens.length
    const uniqueQueryTokens = [...new Set(queryTokens)]

    for (const term of uniqueQueryTokens) {
      let docFreq = 0
      for (const doc of docTokens) {
        if (doc.includes(term)) {
          docFreq++
        }
      }
      idf.set(term, Math.log((n - docFreq + 0.5) / (docFreq + 0.5) + 1))
    }

    return idf
  }

  private computeBM25(
    termFreq: Map<string, number>,
    docLength: number,
    avgDocLength: number,
    queryTokens: string[],
    idf: Map<string, number>
  ): number {
    let score = 0

    for (const term of queryTokens) {
      const tf = termFreq.get(term) ?? 0
      const termIdf = idf.get(term) ?? 0

      if (tf === 0) continue

      const numerator = termIdf * tf * (K1 + 1)
      const denominator = tf + K1 * (1 - B + B * (docLength / avgDocLength))
      score += numerator / denominator
    }

    return score
  }
}
