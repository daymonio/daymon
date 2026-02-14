import { describe, it, expect } from 'vitest'
import { parseStreamEvent } from '../claude-code'

describe('parseStreamEvent', () => {
  it('returns tool_use progress for content_block_start with tool_use', () => {
    const event = {
      type: 'content_block_start',
      content_block: { type: 'tool_use', name: 'Bash' }
    }
    const result = parseStreamEvent(event, 0)
    expect(result).not.toBeNull()
    expect(result!.message).toBe('Step 1: Using Bash...')
    expect(result!.fraction).toBeNull()
    expect(result!.isToolUse).toBe(true)
  })

  it('increments step number based on toolCallCount', () => {
    const event = {
      type: 'content_block_start',
      content_block: { type: 'tool_use', name: 'Edit' }
    }
    const result = parseStreamEvent(event, 3)
    expect(result!.message).toBe('Step 4: Using Edit...')
  })

  it('uses "tool" as default name when name is missing', () => {
    const event = {
      type: 'content_block_start',
      content_block: { type: 'tool_use' }
    }
    const result = parseStreamEvent(event, 0)
    expect(result!.message).toBe('Step 1: Using tool...')
  })

  it('returns completed progress for result event', () => {
    const event = { type: 'result', result: 'Task done' }
    const result = parseStreamEvent(event, 5)
    expect(result).not.toBeNull()
    expect(result!.fraction).toBe(1.0)
    expect(result!.message).toBe('Completed')
    expect(result!.isToolUse).toBe(false)
  })

  it('returns null for content_block_start without tool_use', () => {
    const event = {
      type: 'content_block_start',
      content_block: { type: 'text' }
    }
    expect(parseStreamEvent(event, 0)).toBeNull()
  })

  it('returns null for unrecognized event types', () => {
    expect(parseStreamEvent({ type: 'content_block_delta' }, 0)).toBeNull()
    expect(parseStreamEvent({ type: 'message_start' }, 0)).toBeNull()
    expect(parseStreamEvent({}, 0)).toBeNull()
  })

  it('returns null for content_block_start without content_block', () => {
    const event = { type: 'content_block_start' }
    expect(parseStreamEvent(event, 0)).toBeNull()
  })
})
