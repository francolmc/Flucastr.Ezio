import type { ModelAdapter } from '../adapters/ModelAdapter'
import type { Tool } from '../types/index'
import type { ChatMessage } from '../adapters/ModelAdapter'

export class ToolRetriever {
  constructor(private adapter: ModelAdapter, private tools: Tool[]) {}

  async retrieve(objective: string, maxTools = 5): Promise<Tool[]> {
    const filteredTools = this.tools.filter(t => !t.description.includes('DEPRECATED'))

    const toolList = filteredTools
      .map(t => {
        const firstLine = t.description.split('\n')[0]
        return `${t.name}: ${firstLine}`
      })
      .join('\n')

    const prompt = `You are a tool selector. Select the minimum tools needed to achieve the objective.

OBJECTIVE: ${objective}

AVAILABLE TOOLS:
${toolList}

Rules:
- Select only tools directly needed for the objective
- Consider dependencies: if writing requires reading first, include both
- Maximum ${maxTools} tools
- Use ONLY tool names from the list above
- If no tools needed: respond with NONE

Respond with ONLY tool names separated by commas, nothing else.`

    const messages: ChatMessage[] = [{ role: 'user', content: prompt }]

    try {
      const response = await this.adapter.complete(messages)
      const selected = this.parseResponse(response)

      if (selected.length === 0) {
        console.warn('[ToolRetriever] No tools selected, using fallback')
        return filteredTools.slice(0, maxTools)
      }

      const toolMap = new Map(filteredTools.map(t => [t.name.toLowerCase(), t]))
      const result = selected
        .map(name => toolMap.get(name.toLowerCase()))
        .filter((t): t is Tool => t !== undefined)

      if (result.length === 0) {
        console.warn('[ToolRetriever] No matched tools, using fallback')
        return filteredTools.slice(0, maxTools)
      }

      return result
    } catch (err) {
      console.warn('[ToolRetriever] Error:', err)
      return filteredTools.slice(0, maxTools)
    }
  }

  private parseResponse(response: string): string[] {
    const trimmed = response.trim()
    if (!trimmed || trimmed.toUpperCase() === 'NONE') {
      return []
    }
    return trimmed.split(',').map(s => s.trim().toLowerCase())
  }
}
