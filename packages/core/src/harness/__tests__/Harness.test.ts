import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ModelAdapter } from '../../adapters/ModelAdapter'
import type { Tool, ToolRegistry } from '../../types/index'
import { Harness } from '../Harness'

function isFusedPrompt(content: string): boolean {
  return content.includes('OVERALL OBJECTIVE:') && content.includes('FOCUS:')
}

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
      callTool: vi.fn().mockResolvedValue('File written successfully')
    }
    fakeTool = { name: 'write_file', description: 'writes a file', inputSchema: {}, annotations: { destructiveHint: false } }
    baseContext = {
      systemPromptBase: 'You are a helpful assistant',
      classification: 'complex'
    }
  })

  it('run() with next action returns array with one StepResult', async () => {
    let callCount = 0
    fakeAdapter.complete = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve('NONE')
      if (callCount === 2) return Promise.resolve('Use write_file tool to write the config')
      if (callCount === 3) return Promise.resolve('{"tool":"write_file","input":{"path":"/tmp/test.txt","content":"x"}}')
      if (callCount === 4) return Promise.resolve('Step 1 (write_file): completed')
      if (callCount === 5) return Promise.resolve('STATUS: YES')
      return Promise.resolve('STATUS: YES')
    })
    const harness = new Harness(fakeAdapter)
    const { results } = await harness.run('write the config file', baseContext, fakeToolRegistry, [fakeTool])
    expect(results).toHaveLength(1)
    expect(results[0].tool).toBe('write_file')
  })

  it('StepResult has all required fields', async () => {
    let callCount = 0
    fakeAdapter.complete = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve('NONE')
      if (callCount === 2) return Promise.resolve('Use write_file tool to write the config')
      if (callCount === 3) return Promise.resolve('{"tool":"write_file","input":{"path":"/tmp/test.txt","content":"x"}}')
      if (callCount === 4) return Promise.resolve('Step 1 (write_file): completed')
      if (callCount === 5) return Promise.resolve('STATUS: YES')
      return Promise.resolve('STATUS: YES')
    })
    const harness = new Harness(fakeAdapter)
    const { results } = await harness.run('write the config file', baseContext, fakeToolRegistry, [fakeTool])
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
      if (callCount === 2) return Promise.resolve('Use write_file tool')
      if (callCount === 3) return Promise.resolve('not valid json')
      return Promise.resolve('also invalid')
    })
    const harness = new Harness(fakeAdapter)
    const { results } = await harness.run('write the config file', baseContext, fakeToolRegistry, [fakeTool])
    expect(results[0].status).toBe('failed')
    expect(results[0].failReason).toBe('SerializePhase failed')
  })

  it('first step reason prompt uses buildStepReasonPrompt (no STATUS:)', async () => {
    let callCount = 0
    fakeAdapter.complete = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve('NONE')
      if (callCount === 2) return Promise.resolve('Use write_file')
      if (callCount === 3) return Promise.resolve('{"tool":"write_file","input":{"path":"/tmp/test.txt","content":"x"}}')
      if (callCount === 4) return Promise.resolve('Step 1 (write_file): completed')
      if (callCount === 5) return Promise.resolve('STATUS: YES')
      return Promise.resolve('STATUS: YES')
    })
    const harness = new Harness(fakeAdapter)
    await harness.run('write the config file', baseContext, fakeToolRegistry, [fakeTool])
    const firstReasonCall = fakeAdapter.complete.mock.calls[1]
    const prompt = firstReasonCall[0][0].content
    expect(prompt).toContain('OBJECTIVE:')
    expect(prompt).not.toContain('STATUS:')
  })

  it('subsequent steps use fused prompt with STATUS:', async () => {
    let callCount = 0
    fakeAdapter.complete = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve('NONE')
      if (callCount === 2) return Promise.resolve('Use write_file to write config')
      if (callCount === 3) return Promise.resolve('{"tool":"write_file","input":{"path":"/tmp/test.txt","content":"x"}}')
      if (callCount === 4) return Promise.resolve('Step 1 (write_file): wrote config file')
      if (callCount === 5) return Promise.resolve('STATUS: NO\nUse write_file again')
      if (callCount === 6) return Promise.resolve('{"tool":"write_file","input":{"path":"/tmp/test2.txt","content":"y"}}')
      if (callCount === 7) return Promise.resolve('Step 2 (write_file): completed')
      if (callCount === 8) return Promise.resolve('STATUS: YES')
      return Promise.resolve('STATUS: YES')
    })
    const harness = new Harness(fakeAdapter)
    await harness.run('write and process config', baseContext, fakeToolRegistry, [fakeTool])
    const allCalls = fakeAdapter.complete.mock.calls
    const fusedCall = allCalls.find(call =>
      typeof call[0][0].content === 'string' &&
      call[0][0].content.includes('OVERALL OBJECTIVE:')
    )
    expect(fusedCall).toBeDefined()
    expect(fusedCall![0][0].content).toContain('STATUS:')
    expect(fusedCall![0][0].content).toContain('FOCUS:')
  })

  it('reaches maxSteps limit', async () => {
    let callCount = 0
    fakeAdapter.complete = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve('NONE')
      if (callCount === 2) return Promise.resolve('Use read_file')
      if (callCount === 3) return Promise.resolve('{"tool":"read_file","input":{}}')
      if (callCount === 4) return Promise.resolve('Step 1 completed')
      if (callCount === 5) return Promise.resolve('STATUS: NO\nUse read_file')
      if (callCount === 6) return Promise.resolve('{"tool":"read_file","input":{}}')
      if (callCount === 7) return Promise.resolve('Step 2 completed')
      if (callCount === 8) return Promise.resolve('STATUS: NO\nUse read_file')
      if (callCount === 9) return Promise.resolve('{"tool":"read_file","input":{}}')
      if (callCount === 10) return Promise.resolve('Step 3 completed')
      if (callCount === 11) return Promise.resolve('STATUS: NO\nUse read_file')
      return Promise.resolve('STATUS: NO\nUse read_file')
    })
    const harness = new Harness(fakeAdapter)
    const { results } = await harness.run('impossible task', baseContext, fakeToolRegistry, [fakeTool], 3)
    expect(results.length).toBeLessThanOrEqual(3)
  })

  it('Verifier retry preserves stepFocus', async () => {
    let callCount = 0
    fakeAdapter.complete = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve('NONE')
      if (callCount === 2) return Promise.resolve('Use read_file')
      if (callCount === 3) return Promise.resolve('{"tool":"read_file","input":{}}')
      if (callCount === 4) return Promise.resolve('Step 1 (read_file): completed')
      if (callCount === 5) return Promise.resolve('STATUS: NO\nUse read_file')
      if (callCount === 6) return Promise.resolve('{"tool":"read_file","input":{}}')
      if (callCount === 7) return Promise.resolve('Step 2 (read_file): completed')
      if (callCount === 8) return Promise.resolve('NO - not correct')
      if (callCount === 9) return Promise.resolve('Use read_file to fix it')
      if (callCount === 10) return Promise.resolve('{"tool":"read_file","input":{}}')
      if (callCount === 11) return Promise.resolve('Step 2 (read_file): completed')
      if (callCount === 12) return Promise.resolve('STATUS: YES')
      return Promise.resolve('STATUS: YES')
    })

    const harness = new Harness(fakeAdapter)
    await harness.run('task with micro-step retry', baseContext, fakeToolRegistry, [fakeTool])

    const allCalls = fakeAdapter.complete.mock.calls
    const stepReasonPrompts: string[] = []
    for (const call of allCalls) {
      const sys = call[0][0]?.content ?? ''
      if (sys.includes('OBJECTIVE:') && sys.includes('TASK:') && !isFusedPrompt(sys)) {
        stepReasonPrompts.push(sys)
      }
    }

    expect(stepReasonPrompts.length).toBeGreaterThanOrEqual(1)
    for (const prompt of stepReasonPrompts) {
      expect(prompt).not.toContain('STATUS:')
    }
  })

  it('micro-steps never use fused/doneCheck path even when STATUS: YES mock is present', async () => {
    let callCount = 0
    fakeAdapter.complete = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve('NO')  // doneCheck step 1
      if (callCount === 2) return Promise.resolve('Continue with task')  // stepReason step 1
      if (callCount === 3) return Promise.resolve('{"tool":"read_file","input":{"path":"a.txt"}}')  // serialize step 1
      if (callCount === 4) return Promise.resolve('Step 1: read a')  // summary step 1
      if (callCount === 5) return Promise.resolve('STATUS: NO\nContinue')  // fused step 2
      if (callCount === 6) return Promise.resolve('{"tool":"read_file","input":{"path":"b.txt"}}')  // serialize step 2
      if (callCount === 7) return Promise.resolve('Step 2: read b')  // summary step 2
      if (callCount === 8) return Promise.resolve('STATUS: NO\nContinue')  // fused step 3
      if (callCount === 9) return Promise.resolve('{"tool":"read_file","input":{"path":"c.txt"}}')  // serialize step 3
      if (callCount === 10) return Promise.resolve('Step 3: read c')  // summary step 3
      if (callCount === 11) return Promise.resolve('STATUS: NO\nContinue')  // fused step 4
      if (callCount === 12) return Promise.resolve('{"tool":"read_file","input":{"path":"d.txt"}}')  // serialize step 4
      if (callCount === 13) return Promise.resolve('Step 4: read d')  // summary step 4
      if (callCount === 14) return Promise.resolve('no progress in last 4 steps')  // decompose prompt
      if (callCount === 15) return Promise.resolve('1. micro step A\n2. micro step B')  // decompose response
      if (callCount === 16) return Promise.resolve('micro step A reason')
      if (callCount === 17) return Promise.resolve('{"tool":"write_file","input":{"path":"a.txt"}}')  // serialize micro step A
      if (callCount === 18) return Promise.resolve('Step 5: micro A complete')
      if (callCount === 19) return Promise.resolve('micro step B reason')
      if (callCount === 20) return Promise.resolve('{"tool":"write_file","input":{"path":"b.txt"}}')  // serialize micro step B
      if (callCount === 21) return Promise.resolve('Step 6: micro B complete')
      if (callCount === 22) return Promise.resolve('STATUS: YES')  // after microQueue empty - fused with global objective
      return Promise.resolve('STATUS: YES')
    })

    const harness = new Harness(fakeAdapter, { maxReactiveDecomposePerRun: 1 })
    await harness.run('complex task', baseContext, fakeToolRegistry, [fakeTool])

    const allCalls = fakeAdapter.complete.mock.calls
    let microStepFusedFound = false
    let globalObjectiveCheckFoundAfterMicro = false
    for (const call of allCalls) {
      const sys = call[0][0]?.content ?? ''
      if (sys.includes('OVERALL OBJECTIVE:') && sys.includes('FOCUS:') && sys.includes('micro step')) {
        microStepFusedFound = true
      }
      if (sys.includes('OVERALL OBJECTIVE:') && sys.includes('STATUS:')) {
        globalObjectiveCheckFoundAfterMicro = true
      }
    }
    expect(microStepFusedFound).toBe(false)
    expect(globalObjectiveCheckFoundAfterMicro).toBe(true)
  })

  it('micro-step prompts use stepReasonPrompt, not fused prompt', async () => {
    let callCount = 0
    const reasonPromptsDuringMicro: string[] = []

    fakeAdapter.complete = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve('NO')  // doneCheck
      if (callCount === 2) return Promise.resolve('Continue')  // stepReason
      if (callCount === 3) return Promise.resolve('{"tool":"read_file","input":{}}')  // serialize
      if (callCount === 4) return Promise.resolve('Step 1 done')  // summary
      if (callCount === 5) return Promise.resolve('STATUS: NO\nContinue')  // fused
      if (callCount === 6) return Promise.resolve('{"tool":"read_file","input":{}}')  // serialize
      if (callCount === 7) return Promise.resolve('Step 2 done')  // summary
      if (callCount === 8) return Promise.resolve('STATUS: NO\nContinue')  // fused
      if (callCount === 9) return Promise.resolve('{"tool":"read_file","input":{}}')  // serialize
      if (callCount === 10) return Promise.resolve('Step 3 done')  // summary
      if (callCount === 11) return Promise.resolve('STATUS: NO\nContinue')  // fused
      if (callCount === 12) return Promise.resolve('{"tool":"read_file","input":{}}')  // serialize
      if (callCount === 13) return Promise.resolve('Step 4 done')  // summary
      if (callCount === 14) return Promise.resolve('no progress')  // decompose prompt
      if (callCount === 15) return Promise.resolve('1. micro A\n2. micro B')  // decompose response
      if (callCount === 16) return Promise.resolve('micro A reason')  // micro stepReason
      if (callCount === 17) return Promise.resolve('{"tool":"write_file","input":{"path":"a.txt"}}')  // serialize
      if (callCount === 18) return Promise.resolve('Step 5: micro A')  // summary
      if (callCount === 19) return Promise.resolve('micro B reason')  // micro stepReason
      if (callCount === 20) return Promise.resolve('{"tool":"write_file","input":{"path":"b.txt"}}')  // serialize
      if (callCount === 21) return Promise.resolve('Step 6: micro B')  // summary
      if (callCount === 22) return Promise.resolve('STATUS: YES')  // fused after microQueue empty
      return Promise.resolve('STATUS: YES')
    })

    const harness = new Harness(fakeAdapter, { maxReactiveDecomposePerRun: 1 })
    await harness.run('task with micro', baseContext, fakeToolRegistry, [fakeTool])

    const allCalls = fakeAdapter.complete.mock.calls
    for (let i = 0; i < allCalls.length; i++) {
      const sys = allCalls[i][0]?.[0]?.content ?? ''
      const user = allCalls[i][0]?.[1]?.content ?? ''
      if (sys.includes('OBJECTIVE:') && !isFusedPrompt(sys) && user.includes('micro')) {
        reasonPromptsDuringMicro.push(sys)
      }
    }

    for (const prompt of reasonPromptsDuringMicro) {
      expect(prompt).not.toContain('OVERALL OBJECTIVE:')
    }
  })

  it('when microQueue empties, stepFocus returns to objective and normal completion check resumes', async () => {
    let callCount = 0
    let afterMicroStepsFusedFound = false

    fakeAdapter.complete = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve('NO')  // doneCheck step 1
      if (callCount === 2) return Promise.resolve('Continue')  // stepReason step 1
      if (callCount === 3) return Promise.resolve('{"tool":"read_file","input":{}}')  // serialize
      if (callCount === 4) return Promise.resolve('Step 1 done')  // summary
      if (callCount === 5) return Promise.resolve('STATUS: NO\nContinue')  // fused step 2
      if (callCount === 6) return Promise.resolve('{"tool":"read_file","input":{}}')  // serialize
      if (callCount === 7) return Promise.resolve('Step 2 done')  // summary
      if (callCount === 8) return Promise.resolve('STATUS: NO\nContinue')  // fused step 3
      if (callCount === 9) return Promise.resolve('{"tool":"read_file","input":{}}')  // serialize
      if (callCount === 10) return Promise.resolve('Step 3 done')  // summary
      if (callCount === 11) return Promise.resolve('STATUS: NO\nContinue')  // fused step 4
      if (callCount === 12) return Promise.resolve('{"tool":"read_file","input":{}}')  // serialize
      if (callCount === 13) return Promise.resolve('Step 4 done')  // summary
      if (callCount === 14) return Promise.resolve('no progress')  // decompose prompt
      if (callCount === 15) return Promise.resolve('1. micro1\n2. micro2')  // decompose response
      if (callCount === 16) return Promise.resolve('micro step 1')
      if (callCount === 17) return Promise.resolve('{"tool":"read_file","input":{}}')  // serialize micro 1
      if (callCount === 18) return Promise.resolve('Step 5: micro1')
      if (callCount === 19) return Promise.resolve('micro step 2')
      if (callCount === 20) return Promise.resolve('{"tool":"read_file","input":{}}')  // serialize micro 2
      if (callCount === 21) return Promise.resolve('Step 6: micro2')
      if (callCount === 22) return Promise.resolve('STATUS: YES')  // fused after microQueue empty
      return Promise.resolve('STATUS: YES')
    })

    const harness = new Harness(fakeAdapter, { maxReactiveDecomposePerRun: 1 })
    await harness.run('task with micro-steps', baseContext, fakeToolRegistry, [fakeTool])

    const allCalls = fakeAdapter.complete.mock.calls
    for (let i = 0; i < allCalls.length; i++) {
      const sys = allCalls[i][0][0]?.content ?? ''
      if (sys.includes('OVERALL OBJECTIVE:') && sys.includes('FOCUS:') && sys.includes('STATUS:')) {
        afterMicroStepsFusedFound = true
        break
      }
    }
    expect(afterMicroStepsFusedFound).toBe(true)
  })

  it('regression: without microQueue, step 1 uses doneCheck and step >1 uses fused', async () => {
    let callCount = 0
    fakeAdapter.complete = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve('NO')  // doneCheck step 1
      if (callCount === 2) return Promise.resolve('Continue')  // stepReason step 1
      if (callCount === 3) return Promise.resolve('{"tool":"write_file","input":{"path":"/tmp/test.txt","content":"x"}}')  // serialize
      if (callCount === 4) return Promise.resolve('Step 1 (write_file): completed')  // summary
      if (callCount === 5) return Promise.resolve('STATUS: NO\nUse write_file')  // fused step 2
      if (callCount === 6) return Promise.resolve('{"tool":"write_file","input":{"path":"/tmp/test2.txt","content":"y"}}')  // serialize
      if (callCount === 7) return Promise.resolve('Step 2 (write_file): completed')  // summary
      if (callCount === 8) return Promise.resolve('STATUS: YES')  // fused step 3 - objective complete
      return Promise.resolve('STATUS: YES')
    })

    const harness = new Harness(fakeAdapter)
    await harness.run('no micro task', baseContext, fakeToolRegistry, [fakeTool])

    const allCalls = fakeAdapter.complete.mock.calls
    const doneCheckCall = allCalls[0]
    expect(doneCheckCall[0][1].content).toContain('Is the objective done?')

    const fusedCall = allCalls.find(call =>
      typeof call[0][0].content === 'string' &&
      call[0][0].content.includes('OVERALL OBJECTIVE:')
    )
    expect(fusedCall).toBeDefined()
    expect(fusedCall![0][0].content).toContain('STATUS:')
    expect(fusedCall![0][0].content).toContain('FOCUS:')
  })

  it('SerializePhase retry succeeds on second attempt → step status:ok, retried:true', async () => {
    let callCount = 0
    fakeAdapter.complete = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve('NO')  // doneCheck
      if (callCount === 2) return Promise.resolve('Use write_file')  // reason
      if (callCount === 3) return Promise.resolve('not valid json')  // serialize attempt 1
      if (callCount === 4) return Promise.resolve('Use write_file correctly')  // reason retry
      if (callCount === 5) return Promise.resolve('{"tool":"write_file","input":{"path":"/tmp/test.txt","content":"x"}}')  // serialize retry
      if (callCount === 6) return Promise.resolve('Step 1 (write_file): completed')  // summary
      if (callCount === 7) return Promise.resolve('STATUS: YES')
      return Promise.resolve('STATUS: YES')
    })

    const harness = new Harness(fakeAdapter)
    const { results } = await harness.run('write config file', baseContext, fakeToolRegistry, [fakeTool])

    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('ok')
    expect(results[0].retried).toBe(true)
    expect(results[0].failReason).toBeUndefined()
  })

  it('SerializePhase fails twice → step status:failed, retried:true, run continues to next step', async () => {
    let callCount = 0
    fakeAdapter.complete = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve('NO')  // doneCheck step 1
      if (callCount === 2) return Promise.resolve('Use write_file')  // reason step 1
      if (callCount === 3) return Promise.resolve('invalid json')  // serialize attempt 1
      if (callCount === 4) return Promise.resolve('Use write_file')  // reason retry step 1
      if (callCount === 5) return Promise.resolve('still invalid')  // serialize retry step 1 → fails
      // step 2
      if (callCount === 6) return Promise.resolve('STATUS: NO\nUse read_file')  // fused step 2
      if (callCount === 7) return Promise.resolve('{"tool":"read_file","input":{"path":"/tmp/config.txt"}}')  // serialize step 2
      if (callCount === 8) return Promise.resolve('YES read the config file')  // summary step 2 → verifier approves
      if (callCount === 9) return Promise.resolve('STATUS: YES')  // objective complete
      return Promise.resolve('STATUS: YES')
    })

    const harness = new Harness(fakeAdapter)
    const { results } = await harness.run('process files', baseContext, fakeToolRegistry, [fakeTool])

    expect(results).toHaveLength(2)
    expect(results[0].status).toBe('failed')
    expect(results[0].retried).toBe(true)
    expect(results[0].failReason).toBe('SerializePhase failed')
    expect(results[1].status).toBe('ok')
    expect(results[1].retried).toBe(false)
  })

  it('ReasonPhase fails twice → step status:failed, retried:true, run continues to next step', async () => {
    let callCount = 0
    fakeAdapter.complete = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve('NO')  // doneCheck step 1
      if (callCount === 2) return Promise.resolve(null)  // reason attempt 1 → null (rejected)
      if (callCount === 3) return Promise.resolve(null)  // reason retry → still null
      // step 2
      if (callCount === 4) return Promise.resolve('STATUS: NO\nUse read_file')  // fused step 2
      if (callCount === 5) return Promise.resolve('{"tool":"read_file","input":{"path":"/tmp/config.txt"}}')  // serialize step 2
      if (callCount === 6) return Promise.resolve('YES read the config')  // summary step 2 → verifier approves
      if (callCount === 7) return Promise.resolve('STATUS: YES')  // objective complete
      return Promise.resolve('STATUS: YES')
    })

    const harness = new Harness(fakeAdapter)
    const { results } = await harness.run('process files', baseContext, fakeToolRegistry, [fakeTool])

    expect(results).toHaveLength(2)
    expect(results[0].status).toBe('failed')
    expect(results[0].retried).toBe(true)
    expect(results[0].failReason).toBe('ReasonPhase failed')
    expect(results[1].status).toBe('ok')
    expect(results[1].retried).toBe(false)
  })
})
