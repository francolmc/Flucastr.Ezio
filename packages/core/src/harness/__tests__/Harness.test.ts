import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ModelAdapter } from '../../adapters/ModelAdapter'
import type { Subtask, Tool, ToolRegistry } from '../../types/index'
import { Harness } from '../Harness'

describe('Harness', () => {
  let fakeAdapter: ModelAdapter
  let fakeToolRegistry: ToolRegistry
  let fakeTool: Tool
  let subtask: Subtask
  let baseContext: Omit<import('../../types/index').HarnessContext, 'subtask' | 'tools'>

  beforeEach(() => {
    fakeAdapter = {
      complete: vi.fn()
    }
    fakeToolRegistry = {
      callTool: vi.fn().mockResolvedValue('tool result')
    }
    fakeTool = { name: 'read_file', description: 'reads a file', inputSchema: {} }
    subtask = { id: 1, objective: 'read the config file', dependsOn: null }
    baseContext = {
      systemPromptBase: 'You are a helpful assistant',
      previousSummaries: [],
      classification: 'complex'
    }
  })

  it('run() with a subtask returns array with one StepResult', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('Use read_file tool')
    const harness = new Harness(fakeAdapter)
    const results = await harness.run([subtask], baseContext, fakeToolRegistry, [fakeTool])
    expect(results).toHaveLength(1)
    expect(results[0]).toBeDefined()
  })

  it('StepResult has all required fields: subtaskId, summary, tool, rawResult, toolInput, status', async () => {
    fakeAdapter.complete = vi.fn().mockResolvedValue('Use read_file tool')
    const harness = new Harness(fakeAdapter)
    const results = await harness.run([subtask], baseContext, fakeToolRegistry, [fakeTool])
    expect(results[0]).toHaveProperty('subtaskId')
    expect(results[0]).toHaveProperty('summary')
    expect(results[0]).toHaveProperty('tool')
    expect(results[0]).toHaveProperty('rawResult')
    expect(results[0]).toHaveProperty('toolInput')
    expect(results[0]).toHaveProperty('status')
  })

  it('if adapter fails in ReasonPhase: StepResult with status failed, loop continues', async () => {
    fakeAdapter.complete = vi.fn().mockRejectedValue(new Error('reason failed'))
    const harness = new Harness(fakeAdapter)
    const results = await harness.run([subtask], baseContext, fakeToolRegistry, [fakeTool])
    expect(results[0].status).toBe('failed')
    expect(results[0].failReason).toBe('ReasonPhase failed')
  })

  it('if JSON from adapter is not parseable and retry also fails: StepResult with status failed', async () => {
    fakeAdapter.complete = vi.fn()
      .mockResolvedValueOnce('invalid json')
      .mockResolvedValueOnce('also invalid')
    const harness = new Harness(fakeAdapter)
    const results = await harness.run([subtask], baseContext, fakeToolRegistry, [fakeTool])
    expect(results[0].status).toBe('failed')
  })

  it('first subtask has previousSummaries empty in context', async () => {
    const completeSpy = vi.fn().mockResolvedValue('{"tool":"read_file","input":{}}')
    fakeAdapter.complete = completeSpy
    const harness = new Harness(fakeAdapter)
    await harness.run([subtask], baseContext, fakeToolRegistry, [fakeTool])
    expect(completeSpy).toHaveBeenCalled()
    const calls = completeSpy.mock.calls
    const reasonCall = calls.find(call => call[0][0].content.includes('INPUT FROM PREVIOUS STEPS'))
    expect(reasonCall).toBeUndefined()
  })

  it('second subtask receives summary of first in previousSummaries', async () => {
    const completeSpy = vi.fn()
      .mockResolvedValueOnce('Use read_file')
      .mockResolvedValueOnce('{"tool":"read_file","input":{}}')
      .mockResolvedValueOnce('Step 1 completed')
      .mockResolvedValueOnce('Use read_file again')
      .mockResolvedValueOnce('{"tool":"read_file","input":{}}')
      .mockResolvedValueOnce('Step 2 completed')
    fakeAdapter.complete = completeSpy

    const subtask2: Subtask = { id: 2, objective: 'read again', dependsOn: 1 }
    const harness = new Harness(fakeAdapter)
    await harness.run([subtask, subtask2], baseContext, fakeToolRegistry, [fakeTool])

    expect(completeSpy.mock.calls.length).toBeGreaterThanOrEqual(4)
    const secondReasonCall = completeSpy.mock.calls[3]
    expect(secondReasonCall[0][0].content).toContain('Step 1')
  })

  it('Verifier returns NO twice then YES: max 1 retry, status failed', async () => {
    fakeAdapter.complete = vi.fn()
      .mockResolvedValueOnce('Use read_file')
      .mockResolvedValueOnce('{"tool":"read_file","input":{}}')
      .mockResolvedValueOnce('NO - not approved')
      .mockResolvedValueOnce('Try again')
      .mockResolvedValueOnce('{"tool":"read_file","input":{}}')
      .mockResolvedValueOnce('NO - still not approved')
      .mockResolvedValueOnce('Step failed')
    const harness = new Harness(fakeAdapter)
    const results = await harness.run([subtask], baseContext, fakeToolRegistry, [fakeTool])
    expect(results[0].status).toBe('failed')
  })
})
