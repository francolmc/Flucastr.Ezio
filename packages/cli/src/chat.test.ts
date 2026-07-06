import { describe, it, expect } from 'vitest'

describe('CLI Module', () => {
  it('can be imported without errors', async () => {
    const chat = await import('./chat')
    expect(chat).toBeDefined()
  })
})
