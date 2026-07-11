import { describe, it, expect } from 'vitest'
import { WorkingState } from '../WorkingState'

describe('WorkingState', () => {
  describe('toolCallCounts', () => {
    it('after 3 list_directory and 0 move_file calls, toPromptBlock includes "list_directory (×3)" and not "move_file"', () => {
      const ws = new WorkingState('move /tmp/foo to /tmp/bar')

      ws.update('list_directory', { path: '/tmp' }, '[FILE] foo', 1)
      ws.update('list_directory', { path: '/tmp' }, '[FILE] foo', 2)
      ws.update('list_directory', { path: '/tmp' }, '[FILE] foo', 3)

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
      ws.update('send_payment', { to: 'joe', amount: 50 }, 'Payment sent', 1)
      ws.update('send_payment', { to: 'joe', amount: 50 }, 'Payment sent', 2)

      const block = ws.toPromptBlock()
      expect(block).toContain('send_payment (×2)')
    })

    it('tracks counts correctly across different tools', () => {
      const ws = new WorkingState('set up project')

      ws.update('create_directory', { path: '/tmp/proj' }, 'created', 1)
      ws.update('write_file', { path: '/tmp/proj/index.js' }, 'written', 2)
      ws.update('list_directory', { path: '/tmp/proj' }, '[FILE] index.js', 3)
      ws.update('create_directory', { path: '/tmp/proj/src' }, 'created', 4)

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
})
