import { DatabaseSync } from 'node:sqlite'
import * as path from 'node:path'
import * as os from 'node:os'

interface Event {
  id: number
  ts: number
  runId: string
  subtaskId: number | null
  component: string
  event: string
  level: string
  data: string
}

function parseData(data: string): Record<string, unknown> {
  try {
    return JSON.parse(data)
  } catch {
    return {}
  }
}

function getDb(): DatabaseSync {
  const dbPath = process.env.EZIO_DB_PATH ?? path.join(os.homedir(), '.ezio', 'ezio.db')
  const db = new DatabaseSync(dbPath)
  return db
}

function getSinceClause(since: string | undefined): string {
  if (!since) return ''
  const match = since.match(/^(\d+)d$/)
  if (!match) return ''
  const days = parseInt(match[1], 10)
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return `WHERE ts >= ${cutoff}`
}

function getEvents(db: DatabaseSync, since: string | undefined): Event[] {
  const where = getSinceClause(since)
  const query = `SELECT * FROM events ${where} ORDER BY ts DESC`
  return db.prepare(query).all() as unknown as Event[]
}

function groupByRunId(events: Event[]): Map<string, Event[]> {
  const groups = new Map<string, Event[]>()
  for (const event of events) {
    const existing = groups.get(event.runId) ?? []
    existing.push(event)
    groups.set(event.runId, existing)
  }
  return groups
}

function reportReactiveDecompose(events: Event[]): void {
  const triggered = events.filter(e => e.event === 'reactive_decompose_triggered')
  const failed = events.filter(e => e.event === 'reactive_decompose_failed')
  const total = triggered.length + failed.length
  const failRate = total > 0 ? ((failed.length / total) * 100).toFixed(1) : '0.0'

  console.log('\n=== Reactive Decompose ===')
  console.log(`  triggered:   ${triggered.length}`)
  console.log(`  failed:     ${failed.length}`)
  console.log(`  fail rate:  ${failRate}%`)
}

function reportToolNameCorrupt(events: Event[]): void {
  const corrupt = events.filter(e => e.event === 'tool_name_corrupt')

  console.log('\n=== Tool Name Corrupt ===')
  console.log(`  total: ${corrupt.length}`)

  const byModel = new Map<string, number>()
  for (const e of corrupt) {
    const data = parseData(e.data)
    const model = String(data.model ?? 'unknown')
    byModel.set(model, (byModel.get(model) ?? 0) + 1)
  }

  if (byModel.size > 0) {
    console.log('  by model:')
    for (const [model, count] of Array.from(byModel.entries())) {
      console.log(`    ${model}: ${count}`)
    }
  }
}

function reportVerifierCheck(events: Event[]): void {
  const checks = events.filter(e => e.event === 'verifier_check')

  console.log('\n=== Verifier Check ===')
  console.log(`  total checks: ${checks.length}`)

  let groundedCount = 0
  let costLLMCount = 0

  for (const e of checks) {
    const data = parseData(e.data)
    if (data.grounded === true) groundedCount++
    if (data.costLLM === true) costLLMCount++
  }

  const freeRate = checks.length > 0 ? ((groundedCount / checks.length) * 100).toFixed(1) : '0.0'
  const llmRate = checks.length > 0 ? ((costLLMCount / checks.length) * 100).toFixed(1) : '0.0'

  console.log(`  grounded (free):  ${groundedCount} (${freeRate}%)`)
  console.log(`  cost LLM:        ${costLLMCount} (${llmRate}%)`)
}

function reportVerifierRejectedTwice(events: Event[]): void {
  const rejected = events.filter(e => e.event === 'verifier_rejected_twice')

  console.log('\n=== Verifier Rejected Twice (Escalation Candidates) ===')
  console.log(`  total: ${rejected.length}`)
}

function reportClassification(events: Event[]): void {
  const classifications = events.filter(e => e.event === 'classification')

  console.log('\n=== Classification ===')
  console.log(`  total: ${classifications.length}`)

  const distribution = { simple: 0, moderate: 0, complex: 0 }
  const byModel = new Map<string, { simple: number, moderate: number, complex: number }>()

  for (const e of classifications) {
    const data = parseData(e.data) as { classification?: string, model?: string }
    const cls = data.classification as keyof typeof distribution
    const model = data.model ?? 'unknown'

    if (cls in distribution) {
      distribution[cls]++
    }

    if (!byModel.has(model)) {
      byModel.set(model, { simple: 0, moderate: 0, complex: 0 })
    }
    const modelStats = byModel.get(model)!
    if (cls in modelStats) {
      modelStats[cls]++
    }
  }

  console.log('  distribution:')
  console.log(`    simple:   ${distribution.simple}`)
  console.log(`    moderate: ${distribution.moderate}`)
  console.log(`    complex:  ${distribution.complex}`)

  if (byModel.size > 0) {
    console.log('  by model:')
    for (const [model, stats] of Array.from(byModel.entries())) {
      console.log(`    ${model}: simple=${stats.simple}, moderate=${stats.moderate}, complex=${stats.complex}`)
    }
  }
}

function reportPhaseRetryUsed(events: Event[]): void {
  const retries = events.filter(e => e.event === 'phase_retry_used')

  console.log('\n=== Phase Retry Used ===')
  console.log(`  total: ${retries.length}`)

  const byPhase = { reason: 0, serialize: 0 }
  for (const e of retries) {
    const data = parseData(e.data) as { phase?: string }
    if (data.phase === 'reason' || data.phase === 'serialize') {
      byPhase[data.phase]++
    }
  }

  console.log(`  reason:   ${byPhase.reason}`)
  console.log(`  serialize: ${byPhase.serialize}`)
}

function main(): void {
  const args = process.argv.slice(2)
  const sinceArg = args.find(a => a.startsWith('--since='))?.split('=')[1]

  const db = getDb()

  console.log('=== Event Log Report ===')
  if (sinceArg) {
    console.log(`  since: ${sinceArg}`)
  }

  const events = getEvents(db, sinceArg)
  console.log(`  total events: ${events.length}`)

  if (events.length === 0) {
    console.log('\nNo events to report.')
    return
  }

  const groups = groupByRunId(events)
  console.log(`  unique runs: ${groups.size}`)

  reportReactiveDecompose(events)
  reportToolNameCorrupt(events)
  reportVerifierCheck(events)
  reportVerifierRejectedTwice(events)
  reportClassification(events)
  reportPhaseRetryUsed(events)

  console.log('\n========================\n')
}

main()
