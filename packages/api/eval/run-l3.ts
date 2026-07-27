#!/usr/bin/env tsx

import { scenariosL3 } from './l3-scenarios.js'
import { createSandbox, cleanupSandbox, executeTool } from './sandbox.js'
import type { MessagesResponse } from '../src/pipeline.js'
import fs from 'node:fs'
import path from 'node:path'

const API_URL = process.env.EZIO_API_URL ?? 'http://localhost:4141/v1/messages'
const N_RUNS = 5
const DELAY_MS = 200

const SCENARIO_FILTER = process.env.SCENARIO_FILTER?.split(',').map(s => s.trim())

interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
}

interface TextBlock {
  type: 'text'
  text: string
}

type ContentBlock = ToolUseBlock | ToolResultBlock | TextBlock

interface RunResult {
  pass: boolean
  reason: string
}

interface ScenarioResult {
  id: string
  n: number
  runs: RunResult[]
  allPassed: boolean
  unstable: boolean
  firstFailureReason?: string
}

async function runScenario(scenario: (typeof scenariosL3)[0]): Promise<ScenarioResult> {
  const n = N_RUNS
  const runs: RunResult[] = []

  for (let i = 0; i < n; i++) {
    const sandboxDir = createSandbox()

    if (scenario.seedFiles) {
      const fs = await import('fs')
      const path = await import('path')
      for (const [fileName, content] of Object.entries(scenario.seedFiles)) {
        fs.writeFileSync(path.join(sandboxDir, fileName), content, 'utf-8')
      }
    }

    const messages: { role: string; content: string | ContentBlock[] }[] = []

    try {
      for (const turn of scenario.turns) {
        messages.push({ role: 'user', content: turn.userMessage })

        let toolCallsInThisTurn = 0
        let turnComplete = false

        while (!turnComplete && toolCallsInThisTurn < scenario.maxToolCallsPerTurn) {
          toolCallsInThisTurn++

          const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'l3-eval',
              max_tokens: 300,
              messages: messages,
              tools: scenario.tools
            })
          })

          if (!res.ok) {
            const errText = await res.text()
            messages.push({ role: 'assistant', content: `Error: ${res.status} - ${errText}` })
            break
          }

          const data: MessagesResponse = await res.json()
          const content = data.content[0] as ContentBlock

          if (content.type === 'tool_use') {
            const toolUse = content as ToolUseBlock
            messages.push({ role: 'assistant', content: [toolUse] })

            let result: string
            if (toolUse.name === 'web_search' && turn.mockToolResults) {
              const query = toolUse.input.query as string
              result = turn.mockToolResults[query] || `Mock result for: ${query}`
            } else {
              result = executeTool(sandboxDir, toolUse.name, toolUse.input as Record<string, unknown>)
            }

            const toolResult: ToolResultBlock = {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: result
            }
            messages.push({ role: 'user', content: [toolResult] })
          } else if (content.type === 'text') {
            const textBlock = content as TextBlock
            messages.push({ role: 'assistant', content: textBlock.text })
            turnComplete = true
          } else {
            messages.push({ role: 'assistant', content: `Unexpected content type: ${content.type}` })
            turnComplete = true
          }
        }
      }

      const verification = scenario.verify(sandboxDir)
      runs.push({ pass: verification.pass, reason: verification.reason })

      if (!verification.pass) {
        console.error(`\n[TRANSCRIPT for ${scenario.id}, run ${i + 1}]:`)
        console.error(JSON.stringify(messages, null, 2))
        console.error(`[END TRANSCRIPT ${scenario.id}]\n`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      if (stack) console.error(`[DEBUG stack for ${scenario.id}]:`, stack)
      runs.push({ pass: false, reason: `exception: ${msg}` })
    } finally {
      cleanupSandbox(sandboxDir)
    }

    if (i < n - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
  }

  const passedRuns = runs.filter(r => r.pass).length
  const allPassed = passedRuns === n
  const unstable = passedRuns > 0 && passedRuns < n
  const firstFailure = runs.find(r => !r.pass)

  return {
    id: scenario.id,
    n,
    runs,
    allPassed,
    unstable,
    firstFailureReason: firstFailure?.reason
  }
}

async function main() {
  console.log(`L3 Evaluation Harness (Multi-turn with real tool execution)`)
  console.log(`API: ${API_URL}`)
  console.log(`Runs per scenario: ${N_RUNS}\n`)

  const results: ScenarioResult[] = []

  const scenariosToRun = SCENARIO_FILTER
    ? scenariosL3.filter(s => SCENARIO_FILTER.includes(s.id))
    : scenariosL3

  for (const scenario of scenariosToRun) {
    const result = await runScenario(scenario)
    results.push(result)

    const status = result.allPassed ? 'PASS' : result.unstable ? 'UNSTABLE' : 'FAIL'
    const passedCount = result.runs.filter(r => r.pass).length
    console.log(`[${status}] ${scenario.id} - ${passedCount}/${result.n}`)
  }

  console.log('\n' + '='.repeat(80))
  console.log('DETAILED RESULTS')
  console.log('='.repeat(80))

  console.log(`\n${'ID'.padEnd(6)} ${'Result'.padEnd(10)} ${'Runs'.padEnd(8)} Details`)
  console.log('-'.repeat(70))

  for (const item of results) {
    const status = item.allPassed ? 'PASS' : item.unstable ? 'UNSTABLE' : 'FAIL'
    const passedCount = item.runs.filter(r => r.pass).length
    const details = item.allPassed ? '' : item.firstFailureReason ?? ''
    console.log(
      `${item.id.padEnd(6)} ${status.padEnd(10)} ${`${passedCount}/${item.n}`.padEnd(8)} ${details}`
    )
  }

  console.log('\n' + '='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))

  const passAllCount = results.filter(r => r.allPassed).length
  const total = results.length
  const rate = total > 0 ? passAllCount / total : 0
  const threshold = 0.7
  const status = rate >= threshold ? '✓' : '✗'
  console.log(`pass^5 rate: ${passAllCount}/${total} = ${(rate * 100).toFixed(0)}% ${status} (threshold: ${(threshold * 100).toFixed(0)}%)`)
  console.log(`\nTotal scenarios: ${total}`)
  console.log(`Fully passing (pass^5): ${passAllCount}`)
  console.log(`Unstable: ${results.filter(r => r.unstable).length}`)
  console.log(`Failing: ${results.filter(r => !r.unstable && !r.allPassed).length}`)

  const resultsDir = path.join(process.cwd(), 'eval', 'results')
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outputPath = path.join(resultsDir, `l3-${timestamp}.json`)

  const jsonOutput = {
    timestamp: new Date().toISOString(),
    scenarios: Object.fromEntries(
      results.map(r => {
        const status = r.allPassed ? 'PASS' : r.unstable ? 'UNSTABLE' : 'FAIL'
        return [r.id, { result: status, passedRuns: r.runs.filter(run => run.pass).length, totalRuns: r.n }]
      })
    ),
    passRate: `${passAllCount}/${total}`
  }

  fs.writeFileSync(outputPath, JSON.stringify(jsonOutput, null, 2), 'utf-8')
  console.log(`\nResults saved to: ${outputPath}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
