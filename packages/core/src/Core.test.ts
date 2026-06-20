import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Core } from './Core.js'
import type { ChatMessage, ModelAdapter } from './adapters/ModelAdapter.js'
import { ConfigService } from './config/ConfigService.js'

vi.mock('./config/ConfigService.js')

describe('Core', () => {
  let mockAdapter: ModelAdapter

  beforeEach(() => {
    mockAdapter = {
      complete: vi.fn()
    }
  })

  describe('constructor', () => {
    it('uses ConfigService.getActiveAdapter when no adapter provided', () => {
      const mockGetActiveAdapter = vi.spyOn(ConfigService, 'getActiveAdapter')
      mockGetActiveAdapter.mockReturnValue(mockAdapter)

      const core = new Core()

      expect(mockGetActiveAdapter).toHaveBeenCalledOnce()
      expect(core).toBeDefined()
    })

    it('uses provided adapter when given', () => {
      const core = new Core(mockAdapter)

      const messages: ChatMessage[] = [{ role: 'user', content: 'test' }]
      ;(mockAdapter.complete as ReturnType<typeof vi.fn>).mockResolvedValue('response')

      core.chat('test')

      expect(mockAdapter.complete).toHaveBeenCalledWith(messages)
    })
  })

  describe('chat', () => {
    it('returns response string from adapter', async () => {
      const core = new Core(mockAdapter)
      ;(mockAdapter.complete as ReturnType<typeof vi.fn>).mockResolvedValue('hello world')

      const response = await core.chat('hi')

      expect(response).toBe('hello world')
    })

    it('sends message with user role to adapter', async () => {
      const core = new Core(mockAdapter)
      ;(mockAdapter.complete as ReturnType<typeof vi.fn>).mockResolvedValue('ok')

      await core.chat('hello')

      expect(mockAdapter.complete).toHaveBeenCalledWith([
        { role: 'user', content: 'hello' }
      ])
    })

    it('appends new message to history', async () => {
      const core = new Core(mockAdapter)
      const history: ChatMessage[] = [
        { role: 'user', content: 'previous message' },
        { role: 'assistant', content: 'previous response' }
      ]
      ;(mockAdapter.complete as ReturnType<typeof vi.fn>).mockResolvedValue('new response')

      await core.chat('new message', history)

      expect(mockAdapter.complete).toHaveBeenCalledWith([
        { role: 'user', content: 'previous message' },
        { role: 'assistant', content: 'previous response' },
        { role: 'user', content: 'new message' }
      ])
    })

    it('does not mutate the original history array', async () => {
      const core = new Core(mockAdapter)
      const history: ChatMessage[] = [
        { role: 'user', content: 'original' }
      ]
      const originalLength = history.length
      ;(mockAdapter.complete as ReturnType<typeof vi.fn>).mockResolvedValue('response')

      await core.chat('new', history)

      expect(history.length).toBe(originalLength)
      expect(history).toEqual([{ role: 'user', content: 'original' }])
    })

    it('throws when adapter throws', async () => {
      const core = new Core(mockAdapter)
      ;(mockAdapter.complete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('adapter error'))

      await expect(core.chat('test')).rejects.toThrow('adapter error')
    })
  })
})