import { OllamaAdapter } from '../src/adapters/OllamaAdapter.js'
import { Classifier } from '../src/planner/Classifier.js'
import * as fs from 'node:fs'
import * as path from 'node:path'

interface GoldenCase {
  input: string
  expectedLevel: 'simple' | 'moderate' | 'complex'
  category: string
}

const args = process.argv.slice(2)
const modelArg = args.find(arg => arg.startsWith('--model='))

if (!modelArg) {
  console.error('Usage: tsx scripts/run-classifier-regression.ts --model=<model-name>')
  console.error('Example: tsx scripts/run-classifier-regression.ts --model=qwen3:4b')
  process.exit(1)
}

const model = modelArg.split('=')[1]
const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'

const goldenSetPath = path.join(process.cwd(), 'src/planner/__tests__/fixtures/classifier-golden-set.json')
const goldenSet: GoldenCase[] = JSON.parse(fs.readFileSync(goldenSetPath, 'utf-8'))

console.log(`\nClassifier Regression Test`)
console.log(`Model: ${model}`)
console.log(`Base URL: ${baseUrl}`)
console.log(`Cases: ${goldenSet.length}\n`)

const adapter = new OllamaAdapter({ baseUrl, model })
const classifier = new Classifier(adapter)

const results: Array<{
  input: string
  expected: string
  actual: string
  correct: boolean
  category: string
  duration: number
}> = []

for (const testCase of goldenSet) {
  const start = Date.now()
  try {
    const result = await classifier.classify(testCase.input)
    const duration = Date.now() - start
    const correct = result.level === testCase.expectedLevel
    results.push({
      input: testCase.input,
      expected: testCase.expectedLevel,
      actual: result.level,
      correct,
      category: testCase.category,
      duration
    })
  } catch (err) {
    const duration = Date.now() - start
    results.push({
      input: testCase.input,
      expected: testCase.expectedLevel,
      actual: 'ERROR',
      correct: false,
      category: testCase.category,
      duration
    })
  }
}

const totalCorrect = results.filter(r => r.correct).length
const totalAccuracy = (totalCorrect / results.length * 100).toFixed(1)
const avgDuration = (results.reduce((sum, r) => sum + r.duration, 0) / results.length).toFixed(0)

const byCategory: Record<string, { correct: number; total: number }> = {}
for (const r of results) {
  if (!byCategory[r.category]) byCategory[r.category] = { correct: 0, total: 0 }
  byCategory[r.category].total++
  if (r.correct) byCategory[r.category].correct++
}

const byLevel: Record<string, { correct: number; total: number }> = {}
for (const r of results) {
  if (!byLevel[r.expected]) byLevel[r.expected] = { correct: 0, total: 0 }
  byLevel[r.expected].total++
  if (r.correct) byLevel[r.expected].correct++
}

console.log('=' .repeat(80))
console.log(`OVERALL: ${totalCorrect}/${results.length} correct (${totalAccuracy}%) | Avg time: ${avgDuration}ms`)
console.log('='.repeat(80))

console.log('\nBy Level:')
for (const [level, stats] of Object.entries(byLevel)) {
  const pct = (stats.correct / stats.total * 100).toFixed(1)
  console.log(`  ${level}: ${stats.correct}/${stats.total} (${pct}%)`)
}

console.log('\nBy Category:')
for (const [cat, stats] of Object.entries(byCategory)) {
  const pct = (stats.correct / stats.total * 100).toFixed(1)
  console.log(`  ${cat}: ${stats.correct}/${stats.total} (${pct}%)`)
}

const failed = results.filter(r => !r.correct)
if (failed.length > 0) {
  console.log('\n' + '='.repeat(80))
  console.log('FAILED CASES:')
  console.log('='.repeat(80))
  for (const f of failed) {
    console.log(`  Input: "${f.input}"`)
    console.log(`    Expected: ${f.expected} | Got: ${f.actual}`)
    console.log()
  }
} else {
  console.log('\nAll cases passed!')
}

console.log('')
