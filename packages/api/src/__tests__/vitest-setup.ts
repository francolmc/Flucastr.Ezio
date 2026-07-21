import { vi } from 'vitest'

vi.mock('node:sqlite', () => ({
  DatabaseSync: vi.fn()
}))

vi.mock('@ezio/core', async () => {
  const actual = await vi.importActual('@ezio/core')
  return {
    ...actual,
    createLogger: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    })
  }
})
