import { describe, it, expect } from 'vitest'
import { WorkingState } from '../WorkingState'
import type { Tool } from '../../types/index'

const makeTool = (name: string, annotations?: Tool['annotations']): Tool => ({
  name,
  description: `Test tool ${name}`,
  inputSchema: { type: 'object' },
  annotations
})

describe('WorkingState', () => {
  describe('toolCallCounts', () => {
    it('after 3 list_directory and 0 move_file calls, toPromptBlock includes "list_directory (×3)" and not "move_file"', () => {
      const ws = new WorkingState('move /tmp/foo to /tmp/bar')

      ws.update(makeTool('list_directory'), { path: '/tmp' }, '[FILE] foo', 1)
      ws.update(makeTool('list_directory'), { path: '/tmp' }, '[FILE] foo', 2)
      ws.update(makeTool('list_directory'), { path: '/tmp' }, '[FILE] foo', 3)

      const block = ws.toPromptBlock()

      expect(block).toContain('list_directory (×3)')
      expect(block).not.toContain('move_file')
    })

    it('with empty toolCallCounts (no tool executed yet), line says "none yet"', () => {
      const ws = new WorkingState('do something')
      const block = ws.toPromptBlock()

      expect(block).toContain('Actions taken this run: none yet')
    })

    it('works for an invented tool without any code change', () => {
      const ws = new WorkingState('send a payment')
      ws.update(makeTool('send_payment'), { to: 'joe', amount: 50 }, 'Payment sent', 1)
      ws.update(makeTool('send_payment'), { to: 'joe', amount: 50 }, 'Payment sent', 2)

      const block = ws.toPromptBlock()
      expect(block).toContain('send_payment (×2)')
    })

    it('tracks counts correctly across different tools', () => {
      const ws = new WorkingState('set up project')

      ws.update(makeTool('create_directory'), { path: '/tmp/proj' }, 'Directory created: /tmp/proj', 1)
      ws.update(makeTool('write_file'), { path: '/tmp/proj/index.js' }, 'File written: /tmp/proj/index.js', 2)
      ws.update(makeTool('list_directory'), { path: '/tmp/proj' }, '[FILE] index.js', 3)
      ws.update(makeTool('create_directory'), { path: '/tmp/proj/src' }, 'Directory created: /tmp/proj/src', 4)

      const block = ws.toPromptBlock()

      expect(block).toContain('create_directory (×2)')
      expect(block).toContain('write_file (×1)')
      expect(block).toContain('list_directory (×1)')
    })

    it('IMPORTANT warning is always present regardless of which tools were called', () => {
      const ws = new WorkingState('move files around')
      const block = ws.toPromptBlock()

      expect(block).toContain('IMPORTANT: If the objective requires an action to be performed')
      expect(block).toContain('does not appear above with a count greater than 0')
    })
  })

  describe('confirmedCalls', () => {
    it('records a confirmed call when tool returns non-error', () => {
      const ws = new WorkingState('write a file')
      ws.update(makeTool('write_file'), { path: '/tmp/test.txt', content: 'hello' }, 'File written: /tmp/test.txt', 1)

      const data = ws.getData()
      expect(data.confirmedCalls['write_file']).toBeDefined()
      expect(data.confirmedCalls['write_file']).toHaveLength(1)
      expect(data.confirmedCalls['write_file'][0].inputPreview).toContain('/tmp/test.txt')
    })

    it('does not record a call when tool returns error', () => {
      const ws = new WorkingState('write a file')
      ws.update(makeTool('write_file'), { path: '/tmp/test.txt', content: 'hello' }, 'Error: permission denied', 1)

      const data = ws.getData()
      expect(data.confirmedCalls['write_file']).toBeUndefined()
    })

    it('does not record a call when tool returns cancellation (Error: prefix)', () => {
      const ws = new WorkingState('write a file')
      ws.update(makeTool('write_file'), { path: '/tmp/test.txt', content: 'hello' }, 'Error: operation cancelled by user: write_file: {...}', 1)

      const data = ws.getData()
      expect(data.confirmedCalls['write_file']).toBeUndefined()
    })

    it('does not duplicate entry for same tool+input', () => {
      const ws = new WorkingState('write a file')
      ws.update(makeTool('write_file'), { path: '/tmp/test.txt', content: 'hello' }, 'File written: /tmp/test.txt', 1)
      ws.update(makeTool('write_file'), { path: '/tmp/test.txt', content: 'hello' }, 'File written: /tmp/test.txt', 2)

      const data = ws.getData()
      expect(data.confirmedCalls['write_file']).toHaveLength(1)
    })

    it('records different inputs for same tool separately', () => {
      const ws = new WorkingState('write files')
      ws.update(makeTool('write_file'), { path: '/tmp/a.txt', content: 'a' }, 'File written: /tmp/a.txt', 1)
      ws.update(makeTool('write_file'), { path: '/tmp/b.txt', content: 'b' }, 'File written: /tmp/b.txt', 2)

      const data = ws.getData()
      expect(data.confirmedCalls['write_file']).toHaveLength(2)
    })

    it('confirms returns confirmed for a recorded call', () => {
      const ws = new WorkingState('write a file')
      const writeTool = makeTool('write_file', { destructiveHint: false })
      ws.update(writeTool, { path: '/tmp/test.txt', content: 'hello' }, 'File written: /tmp/test.txt', 1)

      const result = ws.confirms('objective', writeTool, { path: '/tmp/test.txt', content: 'hello' })
      expect(result).toBe('confirmed')
    })

    it('confirms returns unknown for an unrecorded call', () => {
      const ws = new WorkingState('write a file')
      const writeTool = makeTool('write_file', { destructiveHint: false })
      ws.update(writeTool, { path: '/tmp/test.txt', content: 'hello' }, 'File written: /tmp/test.txt', 1)

      const result = ws.confirms('objective', writeTool, { path: '/tmp/other.txt', content: 'other' })
      expect(result).toBe('unknown')
    })

    it('toPromptBlock shows confirmed actions grouped by tool', () => {
      const ws = new WorkingState('set up project')
      ws.update(makeTool('create_directory'), { path: '/tmp/proj' }, 'Directory created: /tmp/proj', 1)
      ws.update(makeTool('write_file'), { path: '/tmp/proj/index.js' }, 'File written: /tmp/proj/index.js', 2)

      const block = ws.toPromptBlock()
      expect(block).toContain('Confirmed actions:')
      expect(block).toContain('create_directory (×1)')
      expect(block).toContain('write_file (×1)')
    })

    it('works generically for any invented tool with annotations', () => {
      const ws = new WorkingState('process payment')
      const payTool = makeTool('process_payment', { destructiveHint: true })
      ws.update(payTool, { orderId: '123', amount: 50 }, 'Payment processed successfully', 1)

      const data = ws.getData()
      expect(data.confirmedCalls['process_payment']).toHaveLength(1)

      const result = ws.confirms('objective', payTool, { orderId: '123', amount: 50 })
      expect(result).toBe('confirmed')
    })

    it('a tool WITHOUT annotations never returns confirmed regardless of prior calls', () => {
      const ws = new WorkingState('run arbitrary command')
      const runCommandTool = makeTool('run_command')

      ws.update(runCommandTool, { command: 'rm -rf /tmp/test' }, 'Files deleted', 1)
      ws.update(runCommandTool, { command: 'rm -rf /tmp/test' }, 'Files deleted', 2)
      ws.update(runCommandTool, { command: 'rm -rf /tmp/test' }, 'Files deleted', 3)

      const data = ws.getData()
      expect(data.confirmedCalls['run_command']).toHaveLength(1)

      const result = ws.confirms('objective', runCommandTool, { command: 'rm -rf /tmp/test' })
      expect(result).toBe('unknown')
    })

    it('a tool WITH annotations returns confirmed after first successful call', () => {
      const ws = new WorkingState('list directory')
      const listDirTool = makeTool('list_directory', { readOnlyHint: true })

      ws.update(listDirTool, { path: '/tmp' }, '[FILE] foo', 1)

      const result = ws.confirms('objective', listDirTool, { path: '/tmp' })
      expect(result).toBe('confirmed')
    })

    it('a tool with destructiveHint returns confirmed after successful call', () => {
      const ws = new WorkingState('delete files')
      const deleteTool = makeTool('delete_file', { destructiveHint: true })

      ws.update(deleteTool, { path: '/tmp/test.txt' }, 'File deleted', 1)

      const result = ws.confirms('objective', deleteTool, { path: '/tmp/test.txt' })
      expect(result).toBe('confirmed')
    })
  })
})
