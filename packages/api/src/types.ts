export interface AnthropicToolSchema {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, { type: string; description?: string; [key: string]: unknown }>
    required?: string[]
  }
}
