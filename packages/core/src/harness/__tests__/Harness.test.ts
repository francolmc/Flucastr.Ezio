import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ModelAdapter } from '../../adapters/ModelAdapter'
import type { Tool, ToolRegistry } from '../../types/index'
import { Harness } from '../Harness'

describe('Harness', () => {
  let fakeAdapter: ModelAdapter
  let fakeToolRegistry: ToolRegistry
  let fakeTool: Tool
  let baseContext: {
    systemPromptBase: string
    classification: string
    targetLanguage?: string
    systemContext?: string
  }

  beforeEach(() => {
    fakeAdapter = {
      complete: vi.fn()
    }
    fakeToolRegistry = {
      callTool: vi.fn().mockResolvedValue('tool result')
    }
    fakeTool = { name: 'read_file', description: 'reads a file', inputSchema: {} }
    baseContext = {
      systemPromptBase: 'You are a helpful assistant',
      classification: 'complex'
    }
  })

  it('run() with DONE on first decide returns empty results', async () => {
    let callCount = 0
    fakeAdapter.complete = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve('NONE')
      if (callCount === 2) return Promise.resolve('DONE')
      return Promise.resolve('DONE')
    })
    const harness = new Harness(fakeAdapter)
    const results = await harness.run('read the config file', baseContext, fakeToolRegistry, [fakeTool])
    expect(results).toHaveLength(0)
  })

  it('run() with next action returns array with one StepResult', async () => {
    let callCount = 0
    fakeAdapter.complete = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve('NONE')
      if (callCount === 2) return Promise.resolve('Use read_file tool to read the config')
      if (callCount === 3) return Promise.resolve('NONE')
      if (callCount === 4) return Promise.resolve('{"tool":"read_file","input":{}}')
      if (callCount === 5) return Promise.resolve('Step 1 (read_file): completed')
      if (callCount === 6) return Promise.resolve('DONE')
      return Promise.resolve('DONE')
    })
    const harness = new Harness(fakeAdapter)
    const results = await harness.run('read the config file', baseContext, fakeToolRegistry, [fakeTool])
    expect(results).toHaveLength(1)
    expect(results[0].tool).toBe('read_file')
  })

  it('StepResult has all required fields', async () => {
    let callCount = 0
    fakeAdapter.complete = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve('NONE')
      if (callCount === 2) return Promise.resolve('Use read_file tool to read the config')
      if (callCount === 3) return Promise.resolve('NONE')
      if (callCount === 4) return Promise.resolve('{"tool":"read_file","input":{}}')
      if (callCount === 5) return Promise.resolve('Step 1 (read_file): completed')
      if (callCount === 6) return Promise.resolve('DONE')
      return Promise.resolve('DONE')
    })
    const harness = new Harness(fakeAdapter)
    const results = await harness.run('read the config file', baseContext, fakeToolRegistry, [fakeTool])
    expect(results[0]).toHaveProperty('subtaskId')
    expect(results[0]).toHaveProperty('summary')
    expect(results[0]).toHaveProperty('tool')
    expect(results[0]).toHaveProperty('rawResult')
    expect(results[0]).toHaveProperty('toolInput')
    expect(results[0]).toHaveProperty('status')
  })

  it('if serialize fails, StepResult has failed status', async () => {
    let callCount = 0
    fakeAdapter.complete = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve('NONE')
      if (callCount === 2) return Promise.resolve('Use read_file tool')
      if (callCount === 3) return Promise.resolve('NONE')
      if (callCount === 4) return Promise.resolve('not valid json')
      return Promise.resolve('also invalid')
    })
    const harness = new Harness(fakeAdapter)
    const results = await harness.run('read the config file', baseContext, fakeToolRegistry, [fakeTool])
    expect(results[0].status).toBe('failed')
    expect(results[0].failReason).toBe('SerializePhase failed')
  })

  it('first decide prompt does not have COMPLETED SO FAR section with content', async () => {
    let callCount = 0
    fakeAdapter.complete = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve('NONE')
      if (callCount === 2) return Promise.resolve('DONE')
      return Promise.resolve('DONE')
    })
    const harness = new Harness(fakeAdapter)
    await harness.run('read the config file', baseContext, fakeToolRegistry, [fakeTool])
    const decideCall = fakeAdapter.complete.mock.calls[1]
    expect(decideCall[0][0].content).not.toContain('COMPLETED SO FAR:\n')
  })

  it('subsequent decide includes previous summary', async () => {
    let callCount = 0
    fakeAdapter.complete = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve('NONE')
      if (callCount === 2) return Promise.resolve('Use read_file to read config')
      if (callCount === 3) return Promise.resolve('NONE')
      if (callCount === 4) return Promise.resolve('{"tool":"read_file","input":{}}')
      if (callCount === 5) return Promise.resolve('Step 1 (read_file): read config file')
      if (callCount === 6) return Promise.resolve('DONE')
      return Promise.resolve('DONE')
    })
    const harness = new Harness(fakeAdapter)
    await harness.run('read and process config', baseContext, fakeToolRegistry, [fakeTool])
    const secondDecideCall = fakeAdapter.complete.mock.calls[6]
    expect(secondDecideCall[0][0].content).toContain('STEP SUMMARIES:\n')
    expect(secondDecideCall[0][0].content).toContain('Step 1')
  })

  it('reaches maxSteps limit', async () => {
    let callCount = 0
    fakeAdapter.complete = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve('NONE')
      if (callCount === 2) return Promise.resolve('Use read_file')
      if (callCount === 3) return Promise.resolve('NONE')
      if (callCount === 4) return Promise.resolve('{"tool":"read_file","input":{}}')
      if (callCount === 5) return Promise.resolve('Step 1 completed')
      if (callCount === 6) return Promise.resolve('Use read_file')
      if (callCount === 7) return Promise.resolve('NONE')
      if (callCount === 8) return Promise.resolve('{"tool":"read_file","input":{}}')
      if (callCount === 9) return Promise.resolve('Step 2 completed')
      if (callCount === 10) return Promise.resolve('Use read_file')
      if (callCount === 11) return Promise.resolve('NONE')
      if (callCount === 12) return Promise.resolve('{"tool":"read_file","input":{}}')
      if (callCount === 13) return Promise.resolve('Step 3 completed')
      if (callCount === 14) return Promise.resolve('Use read_file')
      return Promise.resolve('Use read_file')
    })
    const harness = new Harness(fakeAdapter)
    const results = await harness.run('impossible task', baseContext, fakeToolRegistry, [fakeTool], 3)
    expect(results.length).toBeLessThanOrEqual(3)
  })
})