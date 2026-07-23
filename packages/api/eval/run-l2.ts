#!/usr/bin/env tsx

import { scenarios } from './scenarios.js'
import { gradeResponse } from './grader.js'
import type { MessagesResponse } from '../src/pipeline.js'

const API_URL = process.env.EZIO_API_URL ?? 'http://localhost:4141/v1/messages'
const N_RUNS = 5
const DELAY_MS = 200

interface RunResult {
  pass: boolean
  reason: string
}

interface ScenarioResult {
  id: string
  level: 'simple' | 'moderate' | 'complex'
  n: number
  runs: RunResult[]
  allPassed: boolean
  unstable: boolean
  firstFailureReason?: string
}

async function runScenario(scenario: (typeof scenarios)[0]): Promise<ScenarioResult> {
  const n = scenario.n ?? N_RUNS
  const runs: RunResult[] = []

  for (let i = 0; i < n; i++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'l2-eval',
          max_tokens: 300,
          messages: [{ role: 'user', content: scenario.userMessage }],
          tools: scenario.tools
        })
      })

      if (!res.ok) {
        const errText = await res.text()
        runs.push({ pass: false, reason: `HTTP ${res.status}: ${errText}` })
        await new Promise(r => setTimeout(r, DELAY_MS))
        continue
      }

      const data: MessagesResponse = await res.json()
      const graded = gradeResponse(data, scenario.expected)
      runs.push({ pass: graded.pass, reason: graded.reason })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      runs.push({ pass: false, reason: `exception: ${msg}` })
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
    level: scenario.level,
    n,
    runs,
    allPassed,
    unstable,
    firstFailureReason: firstFailure?.reason
  }
}

async function main() {
  console.log(`L2 Evaluation Harness`)
  console.log(`API: ${API_URL}`)
  console.log(`Default runs: ${N_RUNS}, variable N for m4, m11-m16: 10\n`)

  const results: ScenarioResult[] = []

  for (const scenario of scenarios) {
    const result = await runScenario(scenario)
    results.push(result)

    const status = result.allPassed ? 'PASS' : result.unstable ? 'UNSTABLE' : 'FAIL'
    const passedCount = result.runs.filter(r => r.pass).length
    console.log(`[${status}] ${scenario.id} (${scenario.level}) - ${passedCount}/${result.n}`)
  }

  console.log('\n' + '='.repeat(80))
  console.log('DETAILED RESULTS')
  console.log('='.repeat(80))

  const grouped = {
    simple: results.filter(r => r.level === 'simple'),
    moderate: results.filter(r => r.level === 'moderate'),
    complex: results.filter(r => r.level === 'complex')
  }

  for (const [level, items] of Object.entries(grouped) as [string, ScenarioResult[]][]) {
    console.log(`\n### ${level.toUpperCase()} ###`)
    console.log(`${'ID'.padEnd(6)} ${'Result'.padEnd(10)} ${'Runs'.padEnd(8)} Details`)
    console.log('-'.repeat(60))

    for (const item of items) {
      const status = item.allPassed ? 'PASS' : item.unstable ? 'UNSTABLE' : 'FAIL'
      const passedCount = item.runs.filter(r => r.pass).length
      const details = item.allPassed ? '' : item.firstFailureReason ?? ''
      console.log(
        `${item.id.padEnd(6)} ${status.padEnd(10)} ${`${passedCount}/${item.n}`.padEnd(8)} ${details}`
      )
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))

  const criteria = { simple: 0.9, moderate: 0.9, complex: 0.75 }

  for (const [level, items] of Object.entries(grouped) as [string, ScenarioResult[]][]) {
    const passCount = items.filter(r => r.allPassed).length
    const total = items.length
    const rate = total > 0 ? passCount / total : 0
    const threshold = criteria[level as keyof typeof criteria]
    const status = rate >= threshold ? '✓' : '✗'
    console.log(`${level}: ${passCount}/${total} = ${(rate * 100).toFixed(0)}% ${status} (threshold: ${(threshold * 100).toFixed(0)}%)`)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
