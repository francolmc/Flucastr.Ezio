import type { MessagesResponse } from './pipeline.js'
import type { ServerResponse } from 'node:http'

export function sendSSEResponse(res: ServerResponse, response: MessagesResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  })

  const messageId = response.id
  const model = response.model
  const isToolUse = response.content[0]?.type === 'tool_use'

  const messageStartData = {
    type: 'message_start',
    message: {
      id: messageId,
      type: 'message',
      role: 'assistant',
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: response.usage
    }
  }
  writeEvent(res, 'message_start', messageStartData)

  if (isToolUse) {
    const toolBlock = response.content[0] as { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    const contentBlockStartData = {
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'tool_use',
        id: toolBlock.id,
        name: toolBlock.name,
        input: toolBlock.input
      }
    }
    writeEvent(res, 'content_block_start', contentBlockStartData)

    const partialJson = JSON.stringify(toolBlock.input)
    const contentBlockDeltaData = {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'input_json_delta',
        partial_json: partialJson
      }
    }
    writeEvent(res, 'content_block_delta', contentBlockDeltaData)
  } else {
    const textBlock = response.content[0] as { type: 'text'; text: string }
    const contentBlockStartData = {
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'text',
        text: ''
      }
    }
    writeEvent(res, 'content_block_start', contentBlockStartData)

    const contentBlockDeltaData = {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'text_delta',
        text: textBlock.text
      }
    }
    writeEvent(res, 'content_block_delta', contentBlockDeltaData)
  }

  writeEvent(res, 'content_block_stop', { type: 'content_block_stop', index: 0 })

  const messageDeltaData = {
    type: 'message_delta',
    delta: {
      stop_reason: response.stop_reason,
      stop_sequence: response.stop_sequence
    },
    usage: { output_tokens: response.usage.output_tokens }
  }
  writeEvent(res, 'message_delta', messageDeltaData)

  writeEvent(res, 'message_stop', { type: 'message_stop' })

  res.end()
}

function writeEvent(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}
