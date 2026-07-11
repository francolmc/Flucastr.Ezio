import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'node:fs/promises'

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  stat: vi.fn()
}))

const mockReaddir = vi.mocked(fs.readdir)
const mockStat = vi.mocked(fs.stat)

function mockDirent(name: string, isDirectory: boolean, isFile: boolean) {
  return { name, isDirectory: () => isDirectory, isFile: () => isFile } as import('node:fs').Dirent
}

describe('FilesystemTool executeListDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('with 50 non-matching dirs + 3 matching files, shows files BEFORE the summary line', async () => {
    const { filesystemExecutor } = await import('../FilesystemTool')

    const nonMatchingDirs = Array.from({ length: 50 }, (_, i) =>
      mockDirent(`dir${i}`, true, false)
    )
    const matchingFiles = [
      mockDirent('prueba1.txt', false, true),
      mockDirent('prueba2.txt', false, true),
      mockDirent('prueba3.txt', false, true)
    ]

    mockReaddir.mockResolvedValue([...nonMatchingDirs, ...matchingFiles] as any)

    const result = await filesystemExecutor.list_directory({
      path: '/test',
      filter: 'prueba*'
    })

    const firstFileIndex = result.indexOf('[FILE] prueba1.txt')
    const summaryIndex = result.indexOf('(50 other directories not matching filter, not shown)')

    expect(firstFileIndex).toBeLessThan(summaryIndex)
    expect(result).toContain('prueba1.txt')
    expect(result).toContain('prueba2.txt')
    expect(result).toContain('prueba3.txt')
    expect(result).toContain('(50 other directories not matching filter, not shown)')
    expect(result).not.toContain('[DIR]  dir0/')
  })

  it('with 3 matching files truncated at 1500 chars, files are still visible at start', async () => {
    const { filesystemExecutor } = await import('../FilesystemTool')

    const nonMatchingDirs = Array.from({ length: 100 }, (_, i) =>
      mockDirent(`dir${i}`, true, false)
    )
    const matchingFiles = [
      mockDirent('prueba file one.txt', false, true),
      mockDirent('prueba file two.txt', false, true),
      mockDirent('prueba file three.txt', false, true)
    ]

    mockReaddir.mockResolvedValue([...nonMatchingDirs, ...matchingFiles] as any)

    const result = await filesystemExecutor.list_directory({
      path: '/test',
      filter: 'prueba*'
    })

    const truncatedResult = result.slice(0, 1500)

    expect(truncatedResult).toContain('[FILE] prueba file one.txt')
    expect(truncatedResult).toContain('[FILE] prueba file two.txt')
    expect(truncatedResult).toContain('[FILE] prueba file three.txt')
  })

  it('without filter, result is identical to original behavior (no regression)', async () => {
    const { filesystemExecutor } = await import('../FilesystemTool')

    const entries = [
      mockDirent('dir1', true, false),
      mockDirent('file1.txt', false, true),
      mockDirent('file2.txt', false, true)
    ]

    mockReaddir.mockResolvedValue(entries as any)
    mockStat.mockImplementation((path: string) => {
      const name = path.split('/').pop()
      if (name === 'file1.txt') return Promise.resolve({ size: 100 } as any)
      if (name === 'file2.txt') return Promise.resolve({ size: 200 } as any)
      return Promise.reject(new Error('not found'))
    })

    const result = await filesystemExecutor.list_directory({ path: '/test' })

    expect(result).toContain('[DIR]  dir1/')
    expect(result).toContain('[FILE] file1.txt  (100 bytes)')
    expect(result).toContain('[FILE] file2.txt  (200 bytes)')
    expect(result).toContain('Total: 3 items')
    expect(result).not.toContain('not matching filter')
  })

  it('filter matching both files AND directories, matched dir appears in matched section not summary', async () => {
    const { filesystemExecutor } = await import('../FilesystemTool')

    const entries = [
      mockDirent('Caso 2 - Codelco importante', true, false),
      mockDirent('Caso archivo.txt', false, true),
      mockDirent('random_dir', true, false),
      mockDirent('another_file.txt', false, true)
    ]

    mockReaddir.mockResolvedValue(entries as any)

    const result = await filesystemExecutor.list_directory({
      path: '/test',
      filter: '*Caso*'
    })

    expect(result).toContain('[DIR]  Caso 2 - Codelco importante/')
    expect(result).toContain('[FILE] Caso archivo.txt')
    expect(result).toContain('(1 other directories not matching filter, not shown)')
    expect(result).not.toContain('[DIR]  random_dir/')
  })

  it('all entries match filter, no summary line appears', async () => {
    const { filesystemExecutor } = await import('../FilesystemTool')

    const entries = [
      mockDirent('prueba1.txt', false, true),
      mockDirent('prueba2.txt', false, true),
      mockDirent('prueba_dir/', true, false)
    ]

    mockReaddir.mockResolvedValue(entries as any)

    const result = await filesystemExecutor.list_directory({
      path: '/test',
      filter: 'prueba*'
    })

    expect(result).toContain('[FILE] prueba1.txt')
    expect(result).toContain('[FILE] prueba2.txt')
    expect(result).toContain('[DIR]  prueba_dir/')
    expect(result).not.toContain('not matching filter')
  })

  it('no entries match filter, shows "0 items" and all dirs in summary', async () => {
    const { filesystemExecutor } = await import('../FilesystemTool')

    const entries = [
      mockDirent('dir1', true, false),
      mockDirent('dir2', true, false),
      mockDirent('nomatch.txt', false, true)
    ]

    mockReaddir.mockResolvedValue(entries as any)

    const result = await filesystemExecutor.list_directory({
      path: '/test',
      filter: 'prueba*'
    })

    expect(result).toContain('Total: 0 items')
    expect(result).toContain('(2 other directories not matching filter, not shown)')
  })
})
