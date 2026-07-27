#!/usr/bin/env tsx

import fs from 'node:fs'
import path from 'node:path'

export interface ScenarioEntry {
  result: string
  passedRuns: number
  totalRuns: number
}

export interface L3Results {
  timestamp: string
  scenarios: Record<string, ScenarioEntry>
  passRate: string
}

export interface DiffEntry {
  scenario: string
  oldResult: string
  newResult: string
  oldRuns: number
  newRuns: number
}

export function loadResults(filePath: string): L3Results {
  const content = fs.readFileSync(filePath, 'utf-8')
  return JSON.parse(content) as L3Results
}

export function diff(oldResults: L3Results, newResults: L3Results): { regressions: DiffEntry[], improvements: DiffEntry[], unchanged: string[] } {
  const regressions: DiffEntry[] = []
  const improvements: DiffEntry[] = []
  const unchanged: string[] = []

  const allScenarios = new Set([...Object.keys(oldResults.scenarios), ...Object.keys(newResults.scenarios)])

  for (const scenario of allScenarios) {
    const oldEntry = oldResults.scenarios[scenario]
    const newEntry = newResults.scenarios[scenario]

    if (!oldEntry || !newEntry) continue

    const oldStatus = oldEntry.result
    const newStatus = newEntry.result

    if (newStatus === 'PASS' && oldStatus !== 'PASS') {
      improvements.push({
        scenario,
        oldResult: oldStatus,
        newResult: newStatus,
        oldRuns: oldEntry.passedRuns,
        newRuns: newEntry.passedRuns
      })
    } else if (newStatus !== 'PASS' && oldStatus === 'PASS') {
      regressions.push({
        scenario,
        oldResult: oldStatus,
        newResult: newStatus,
        oldRuns: oldEntry.passedRuns,
        newRuns: newEntry.passedRuns
      })
    } else {
      unchanged.push(scenario)
    }
  }

  return { regressions, improvements, unchanged }
}

export function printDiff(oldFile: string, newFile: string) {
  const oldResults = loadResults(oldFile)
  const newResults = loadResults(newFile)

  const { regressions, improvements, unchanged } = diff(oldResults, newResults)

  console.log(`Comparing:`)
  console.log(`  OLD: ${oldFile} (${oldResults.timestamp})`)
  console.log(`  NEW: ${newFile} (${newResults.timestamp})`)
  console.log('')

  if (regressions.length > 0) {
    console.log('REGRESIONES:')
    for (const r of regressions) {
      console.log(`  REGRESIÓN: ${r.scenario} — ${r.oldResult}(${r.oldRuns}/${r.oldRuns === 5 ? 5 : '?'}) → ${r.newResult}(${r.newRuns}/${r.newRuns === 5 ? 5 : '?'})`)
    }
    console.log('')
  }

  if (improvements.length > 0) {
    console.log('MEJORAS:')
    for (const i of improvements) {
      console.log(`  MEJORA: ${i.scenario} — ${i.oldResult}(${i.oldRuns}/${i.oldRuns === 5 ? 5 : '?'}) → ${i.newResult}(${i.newRuns}/${i.newRuns === 5 ? 5 : '?'})`)
    }
    console.log('')
  }

  if (unchanged.length > 0) {
    console.log(`Sin cambio: ${unchanged.join(', ')}`)
    console.log('')
  }

  console.log(`Resumen: ${regressions.length} regresiones, ${improvements.length} mejoras, ${unchanged.length} sin cambio`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.error('Usage: tsx eval/diff-l3.ts <old-results.json> <new-results.json>')
    process.exit(1)
  }

  const [oldFileRaw, newFileRaw] = args

  const resolve = (f: string) => path.isAbsolute(f) ? f : path.resolve(process.cwd(), f)
  const oldFile = resolve(oldFileRaw)
  const newFile = resolve(newFileRaw)

  if (!fs.existsSync(oldFile)) {
    console.error(`File not found: ${oldFile}`)
    process.exit(1)
  }

  if (!fs.existsSync(newFile)) {
    console.error(`File not found: ${newFile}`)
    process.exit(1)
  }

  printDiff(oldFile, newFile)
}