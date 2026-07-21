import { describe, it, expect } from 'vitest'
import { toInternalTool, toInternalTools, backToExternalTools } from '../toolMapping.js'
import type { AnthropicToolSchema } from '../types.js'

describe('toolMapping', () => {
  describe('toInternalTool', () => {
    it('converts input_schema snake_case to inputSchema camelCase', () => {
      const external: AnthropicToolSchema = {
        name: 'web_search',
        description: 'Search the web',
        input_schema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query']
        }
      }

      const internal = toInternalTool(external)

      expect(internal.name).toBe('web_search')
      expect(internal.description).toBe('Search the web')
      expect(internal.inputSchema).toEqual({
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query']
      })
      expect(internal.annotations).toBeUndefined()
    })
  })

  describe('toInternalTools', () => {
    it('converts array of external schemas to internal tools', () => {
      const externals: AnthropicToolSchema[] = [
        {
          name: 'web_search',
          description: 'Search the web',
          input_schema: {
            type: 'object',
            properties: { query: { type: 'string' } }
          }
        },
        {
          name: 'read_file',
          description: 'Read a file',
          input_schema: {
            type: 'object',
            properties: { path: { type: 'string' } }
          }
        }
      ]

      const internals = toInternalTools(externals)

      expect(internals).toHaveLength(2)
      expect(internals[0].name).toBe('web_search')
      expect(internals[1].name).toBe('read_file')
    })
  })

  describe('backToExternalTools', () => {
    it('returns the ORIGINAL schema objects for selected names', () => {
      const originalSchemas: AnthropicToolSchema[] = [
        {
          name: 'web_search',
          description: 'Search the web',
          input_schema: {
            type: 'object',
            properties: { query: { type: 'string' } }
          }
        },
        {
          name: 'read_file',
          description: 'Read a file',
          input_schema: {
            type: 'object',
            properties: { path: { type: 'string' } }
          }
        }
      ]

      const selectedInternals = [
        { name: 'web_search', description: 'Search the web', inputSchema: {} }
      ]

      const result = backToExternalTools(selectedInternals, originalSchemas)

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(originalSchemas[0])
      expect(result[0]).not.toBe(originalSchemas[1])
    })

    it('ignores selected names that do not exist in originalSchemas without error', () => {
      const originalSchemas: AnthropicToolSchema[] = [
        {
          name: 'web_search',
          description: 'Search the web',
          input_schema: {
            type: 'object',
            properties: { query: { type: 'string' } }
          }
        }
      ]

      const selectedInternals = [
        { name: 'web_search', description: 'Search the web', inputSchema: {} },
        { name: 'nonexistent_tool', description: 'Does not exist', inputSchema: {} }
      ]

      const result = backToExternalTools(selectedInternals, originalSchemas)

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('web_search')
    })

    it('is case-insensitive when matching names', () => {
      const originalSchemas: AnthropicToolSchema[] = [
        {
          name: 'Web_Search',
          description: 'Search the web',
          input_schema: {
            type: 'object',
            properties: { query: { type: 'string' } }
          }
        }
      ]

      const selectedInternals = [
        { name: 'web_search', description: 'Search the web', inputSchema: {} }
      ]

      const result = backToExternalTools(selectedInternals, originalSchemas)

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Web_Search')
    })
  })
})
