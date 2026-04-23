import { describe, expect, test } from 'bun:test'
import { applyAgentEvent, type AgentStreamState } from './agent-atoms'

function createBaseStreamState(overrides?: Partial<AgentStreamState>): AgentStreamState {
  return {
    running: true,
    content: '',
    toolActivities: [],
    teammates: [],
    startedAt: 1,
    ...overrides,
  }
}

describe('applyAgentEvent compact lifecycle', () => {
  test('derives a compacting notice and keeps the compacting flag while compaction starts', () => {
    const next = applyAgentEvent(
      createBaseStreamState(),
      { type: 'compacting' },
    ) as AgentStreamState & {
      compactNotice?: { kind: string; level: string; message: string }
    }

    expect(next.isCompacting).toBe(true)
    expect(next.compactNotice).toEqual({
      kind: 'compact',
      level: 'info',
      message: '正在压缩上下文，请稍候…',
    })
  })

  test('derives a compact success notice and clears it when resumed output starts arriving', () => {
    const compacted = applyAgentEvent(
      createBaseStreamState(),
      { type: 'compact_complete' },
    ) as AgentStreamState & {
      compactNotice?: { kind: string; level: string; message: string }
    }

    expect(compacted.isCompacting).toBe(false)
    expect(compacted.compactNotice?.message).toBe('已压缩，继续处理中')

    const resumed = applyAgentEvent(compacted, {
      type: 'text_delta',
      text: '恢复后的回复',
    }) as AgentStreamState & {
      compactNotice?: { kind: string; level: string; message: string }
    }

    expect(resumed.content).toBe('恢复后的回复')
    expect(resumed.compactNotice).toBeUndefined()
  })

  test('clears compact state when compaction aborts with a generic error', () => {
    const compacting = applyAgentEvent(
      createBaseStreamState(),
      { type: 'compacting' },
    ) as AgentStreamState & {
      compactNotice?: { kind: string; level: string; message: string }
    }

    const failed = applyAgentEvent(compacting, {
      type: 'error',
      message: 'upstream failed',
    }) as AgentStreamState & {
      compactNotice?: { kind: string; level: string; message: string }
    }

    expect(failed.running).toBe(false)
    expect(failed.isCompacting).toBe(false)
    expect(failed.compactNotice).toBeUndefined()
  })

  test('clears compact state when compaction aborts with a typed error', () => {
    const compacting = applyAgentEvent(
      createBaseStreamState(),
      { type: 'compacting' },
    ) as AgentStreamState & {
      compactNotice?: { kind: string; level: string; message: string }
    }

    const failed = applyAgentEvent(compacting, {
      type: 'typed_error',
      error: {
        code: 'unknown_error',
        title: '上游错误',
        message: 'provider rejected request',
        actions: [],
        canRetry: false,
      },
    }) as AgentStreamState & {
      compactNotice?: { kind: string; level: string; message: string }
    }

    expect(failed.running).toBe(false)
    expect(failed.isCompacting).toBe(false)
    expect(failed.compactNotice).toBeUndefined()
  })
})
