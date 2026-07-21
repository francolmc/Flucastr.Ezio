import type { Tool } from '@ezio/core'

const web_search: Tool = {
  name: 'web_search',
  description: 'Search the web and return relevant results',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' }
    },
    required: ['query']
  },
  annotations: { readOnlyHint: true }
}

export interface WebSearchToolConfig {
  tavilyApiKey?: string
}

function extractMainTopic(q: string): string {
  const stopWords = new Set([
    'information', 'about', 'what', 'is', 'the', 'a', 'an',
    'details', 'facts', 'tell', 'me', 'find', 'search', 'for',
    'data', 'on', 'of', 'in', 'and', 'or', 'how', 'why', 'when',
    'where', 'who', 'which', 'get', 'look', 'up', 'know'
  ])
  const words = q.split(/\s+/)
  const meaningful = words.filter(w => !stopWords.has(w.toLowerCase()))
  return meaningful.length > 0 ? meaningful.slice(0, 4).join(' ') : q
}

export function createWebSearchTool(config: WebSearchToolConfig = {}) {
  async function executeWebSearch(
    input: Record<string, unknown>
  ): Promise<string> {
    const rawQuery = input.query
    const query = Array.isArray(rawQuery) ? rawQuery.join(' ') : String(rawQuery ?? '')

    if (!query.trim()) {
      return 'Error: query must be a non-empty string'
    }

    const cleanQuery = extractMainTopic(query)

    if (process.env.EZIO_DEBUG === 'true') {
      console.warn(`[WebSearch] query: "${query}" → cleaned: "${cleanQuery}"`)
    }

    const tavilyKey = config.tavilyApiKey ?? process.env.TAVILY_API_KEY
    if (tavilyKey) {
      try {
        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: tavilyKey,
            query,
            max_results: 5,
            search_depth: 'basic'
          })
        })
        if (response.ok) {
          const data = await response.json() as Record<string, unknown>
          const results = data.results as Array<Record<string, unknown>> ?? []
          const resultTexts = results
            .slice(0, 4)
            .map(r => `${r.title}\n${r.content}\n(source: ${r.url})`)
            .join('\n\n')
          if (resultTexts) {
            if (process.env.EZIO_DEBUG === 'true') {
              console.warn('[WebSearch] answered via Tavily')
            }
            return resultTexts
          }
        }
      } catch {
        // continuar con las estrategias existentes
      }
    }

    // Estrategia 1: DuckDuckGo Instant Answer API
    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1&skip_disambig=1&no_redirect=1`
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      })
      if (response.ok) {
        const data = await response.json() as Record<string, unknown>

        const parts: string[] = []

        if (typeof data.AbstractText === 'string' && data.AbstractText.length > 50) {
          parts.push(data.AbstractText)
        }

        if (typeof data.Answer === 'string' && data.Answer.length > 0) {
          parts.push(data.Answer)
        }

        if (typeof data.Definition === 'string' && data.Definition.length > 0) {
          parts.push(data.Definition)
        }

        const topics = data.RelatedTopics as Array<Record<string, unknown>> ?? []
        const topicTexts = topics
          .filter(t => typeof t.Text === 'string' && (t.Text as string).length > 20)
          .slice(0, 4)
          .map(t => `- ${t.Text}`)
          .join('\n')
        if (topicTexts) parts.push(topicTexts)

        if (parts.length > 0) {
          return parts.join('\n\n')
        }
      }
    } catch {
      // continuar con estrategia 2
    }

    // Estrategia 2: SearXNG instancia pública
    try {
      const searxUrl = `https://searx.be/search?q=${encodeURIComponent(cleanQuery)}&format=json&categories=general&language=en`
      const response = await fetch(searxUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Ezio/0.1 personal assistant'
        }
      })
      if (response.ok) {
        const data = await response.json() as Record<string, unknown>
        const results = data.results as Array<Record<string, unknown>> ?? []

        if (results.length > 0) {
          return results
            .slice(0, 4)
            .map(r => `${r.title}\n${r.content ?? r.url}`)
            .join('\n\n')
        }
      }
    } catch {
      // continuar con estrategia 3
    }

    // Estrategia 3: Wikipedia Search API + Summary
    try {
      const wikiQuery = cleanQuery.split(' ').slice(0, 3).join(' ')
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(wikiQuery)}&format=json&srlimit=1&origin=*`
      const searchResp = await fetch(searchUrl, {
        headers: { 'Accept': 'application/json' }
      })
      if (searchResp.ok) {
        const searchData = await searchResp.json() as Record<string, unknown>
        const pages = (searchData.query as Record<string, unknown>)?.search as Array<Record<string, unknown>>

        if (pages && pages.length > 0) {
          const title = pages[0].title as string

          const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
          const summaryResp = await fetch(summaryUrl, {
            headers: { 'Accept': 'application/json' }
          })
          if (summaryResp.ok) {
            const data = await summaryResp.json() as Record<string, unknown>
            if (typeof data.extract === 'string' && data.extract.length > 0) {
              return `${data.title} (Wikipedia)\n\n${data.extract}`
            }
          }
        }
      }
    } catch {
      // sin resultados
    }

    return `No results found for: ${query}`
  }

  return {
    tools: [web_search] as Tool[],
    executor: { web_search: executeWebSearch } as Record<string, (input: Record<string, unknown>) => Promise<string>>
  }
}

const defaultInstance = createWebSearchTool()
export const webSearchTools = defaultInstance.tools
export const webSearchExecutor = defaultInstance.executor