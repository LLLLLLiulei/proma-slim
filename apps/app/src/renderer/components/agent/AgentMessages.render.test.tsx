import { describe, expect, test } from 'bun:test'
import { AgentMessageItem, AgentMessages } from './AgentMessages'

describe('AgentMessages render boundaries', () => {
  test('wraps the transcript component in a React.memo boundary', () => {
    expect((AgentMessages as { $$typeof?: symbol }).$$typeof).toBe(Symbol.for('react.memo'))
  })

  test('wraps each history item in a React.memo boundary', () => {
    expect((AgentMessageItem as { $$typeof?: symbol }).$$typeof).toBe(Symbol.for('react.memo'))
  })
})
