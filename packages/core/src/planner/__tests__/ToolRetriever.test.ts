import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ModelAdapter } from '../../adapters/ModelAdapter'
import type { Tool } from '../../types/index'
import { ToolRetriever } from '../ToolRetriever'

describe('ToolRetriever', () => {
  let fakeAdapter: ModelAdapter
  let tools: Tool[]

  beforeEach(() => {
    fakeAdapter = {
      complete: vi.fn()
    }
    tools = [
      { name: 'read_file', description: 'reads a file', inputSchema: {} },
      { name: 'write_file', description: 'writes to a file', inputSchema: {} },
      { name: 'web_search', description: 'searches the web', inputSchema: {} }
    ]
  })

  it('adapter returns "read_file" → returns Tool with that name', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('read_file')
    const retriever = new ToolRetriever(fakeAdapter, tools)
    const result = await retriever.retrieve('read a file')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('read_file')
  })

  it('adapter returns "read_file, write_file" → returns both Tools', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('read_file, write_file')
    const retriever = new ToolRetriever(fakeAdapter, tools)
    const result = await retriever.retrieve('read and write')
    expect(result).toHaveLength(2)
    expect(result.map(t => t.name)).toContain('read_file')
    expect(result.map(t => t.name)).toContain('write_file')
  })

  it('adapter returns "NONE" → returns empty array', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('NONE')
    const retriever = new ToolRetriever(fakeAdapter, tools)
    const result = await retriever.retrieve('simple task')
    expect(result).toHaveLength(0)
  })

  it('adapter returns empty string → returns empty array', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('')
    const retriever = new ToolRetriever(fakeAdapter, tools)
    const result = await retriever.retrieve('simple task')
    expect(result).toHaveLength(0)
  })

  it('adapter returns name that does not exist in list → it is ignored, no error', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('nonexistent_tool')
    const retriever = new ToolRetriever(fakeAdapter, tools)
    const result = await retriever.retrieve('do something')
    expect(result).toHaveLength(0)
  })

  it('adapter returns more names than maxTools → limit is respected', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('read_file, write_file, web_search')
    const retriever = new ToolRetriever(fakeAdapter, tools)
    const result = await retriever.retrieve('many things', 2)
    expect(result).toHaveLength(2)
  })

  it('adapter throws error → returns fallback (first maxTools tools)', async () => {
    fakeAdapter.complete = vi.fn().mockRejectedValue(new Error('adapter error'))
    const retriever = new ToolRetriever(fakeAdapter, tools)
    const result = await retriever.retrieve('do something')
    expect(result).toHaveLength(3)
    expect(result[0].name).toBe('read_file')
  })

  it('tools marked as DEPRECATED do not appear in prompt sent to adapter', async () => {
    const toolsWithDeprecated = [
      { name: 'read_file', description: 'reads a file', inputSchema: {} },
      { name: 'old_tool', description: 'DEPRECATED: old tool', inputSchema: {} }
    ]
    fakeAdapter.complete = vi.fn().mockResolvedValue('read_file')
    const retriever = new ToolRetriever(fakeAdapter, toolsWithDeprecated)
    await retriever.retrieve('do something')
    const call = fakeAdapter.complete.mock.calls[0][0]
    expect(call[0].content).not.toContain('old_tool')
    expect(call[0].content).not.toContain('DEPRECATED')
  })
})
