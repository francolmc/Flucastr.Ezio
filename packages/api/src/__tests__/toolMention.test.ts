import { describe, it, expect } from 'vitest'
import { detectMentionedTool, findLastMentionIndex } from '../toolMention.js'

const glob: import('../types.js').AnthropicToolSchema = {
  name: 'glob',
  description: 'Glob pattern matching',
  input_schema: { type: 'object', properties: {}, required: [] }
}

const grep: import('../types.js').AnthropicToolSchema = {
  name: 'grep',
  description: 'Search for pattern in files',
  input_schema: { type: 'object', properties: {}, required: [] }
}

const write: import('../types.js').AnthropicToolSchema = {
  name: 'write',
  description: 'Write content to a file',
  input_schema: { type: 'object', properties: {}, required: [] }
}

const overwrite: import('../types.js').AnthropicToolSchema = {
  name: 'overwrite',
  description: 'Overwrite a file',
  input_schema: { type: 'object', properties: {}, required: [] }
}

describe('findLastMentionIndex', () => {
  it('returns last occurrence index', () => {
    const text = 'I will use write tool to create the file. The write tool is the best.'
    expect(findLastMentionIndex(text, 'write')).toBe(text.lastIndexOf('write'))
  })

  it('returns -1 when not found', () => {
    expect(findLastMentionIndex('hello world', 'write')).toBe(-1)
  })

  it('respects word boundaries', () => {
    const text = 'overwrite is not the same as write'
    expect(findLastMentionIndex(text, 'write')).toBe(29)
    expect(findLastMentionIndex(text, 'overwrite')).toBe(0)
  })

  it('is case-insensitive', () => {
    const text = 'WRITE tool uppercase'
    expect(findLastMentionIndex(text, 'write')).toBe(0)
  })
})

describe('detectMentionedTool', () => {
  it('devuelve la última tool mencionada', () => {
    const reasonText = 'First I will use glob to find the files, then grep to search for errors, and finally write to create the summary.'
    const tools = [glob, grep, write]
    expect(detectMentionedTool(reasonText, tools)).toBe(write)
  })

  it('devuelve null cuando ninguna tool aparece', () => {
    const reasonText = 'I will just answer directly without using any tools.'
    const tools = [glob, grep, write]
    expect(detectMentionedTool(reasonText, tools)).toBeNull()
  })

  it('no matchea substrings parciales (overwrite contiene write)', () => {
    const reasonText = 'I will use overwrite to replace the file content.'
    const tools = [glob, grep, write, overwrite]
    expect(detectMentionedTool(reasonText, tools)).toBe(overwrite)
  })

  it('caso real c5: write es la última decisión', () => {
    const reasonText = 'I will create a resumen.txt file listing the names of the log files that contain the word "ERROR", using the write tool.'
    const tools = [glob, grep, write]
    expect(detectMentionedTool(reasonText, tools)).toBe(write)
  })

  it('devuelve null con lista vacía de tools', () => {
    const reasonText = 'I will use write tool'
    expect(detectMentionedTool(reasonText, [])).toBeNull()
  })
})
