import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentEvent, AgentProviderAdapter, AgentQueryInput } from '@ai-page-builder/shared'
import { AgentEventBus } from './agent-event-bus'
import { AgentOrchestrator } from './agent-orchestrator'
import { createAgentSession, getAgentSessionMessages } from './agent-session-manager'

class TextCompleteOnlyAssistantAdapter implements AgentProviderAdapter {
  async *query(_input: AgentQueryInput): AsyncIterable<AgentEvent> {
    yield {
      type: 'text_complete',
      text: '我已分析你的 CMS 绑定请求。现在准备应用变更。',
      isIntermediate: true,
    }
    yield {
      type: 'tool_start',
      toolName: 'mcp__cms__apply_cms_binding',
      toolUseId: 'tool-apply-binding',
      input: {},
    }
    yield {
      type: 'tool_result',
      toolUseId: 'tool-apply-binding',
      toolName: 'mcp__cms__apply_cms_binding',
      result: 'ok',
      isError: false,
    }
    yield { type: 'complete' }
    yield {
      type: 'text_complete',
      text: '✅ CMS 内容绑定已成功应用！',
      isIntermediate: false,
    }
  }

  abort(): void {}

  dispose(): void {}
}

class MixedAssistantTextAdapter implements AgentProviderAdapter {
  async *query(_input: AgentQueryInput): AsyncIterable<AgentEvent> {
    yield { type: 'text_delta', text: '前置说明：' }
    yield {
      type: 'text_complete',
      text: '前置说明：',
      isIntermediate: true,
    }
    yield {
      type: 'tool_start',
      toolName: 'mcp__cms__apply_cms_binding',
      toolUseId: 'tool-apply-binding',
      input: {},
    }
    yield {
      type: 'tool_result',
      toolUseId: 'tool-apply-binding',
      toolName: 'mcp__cms__apply_cms_binding',
      result: 'ok',
      isError: false,
    }
    yield { type: 'complete' }
    yield {
      type: 'text_complete',
      text: '最终总结：绑定成功。',
      isIntermediate: false,
    }
  }

  abort(): void {}

  dispose(): void {}
}

describe('AgentOrchestrator assistant persistence', () => {
  let configDir: string
  let originalApiKey: string | undefined
  let originalBaseUrl: string | undefined

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-orchestrator-persist-'))
    process.env.PROMA_CONFIG_DIR = configDir
    originalApiKey = process.env.ANTHROPIC_API_KEY
    originalBaseUrl = process.env.ANTHROPIC_BASE_URL
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
  })

  afterEach(() => {
    delete process.env.PROMA_CONFIG_DIR
    if (originalApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = originalApiKey
    }
    if (originalBaseUrl === undefined) {
      delete process.env.ANTHROPIC_BASE_URL
    } else {
      process.env.ANTHROPIC_BASE_URL = originalBaseUrl
    }
    rmSync(configDir, { recursive: true, force: true })
  })

  test('persists assistant content when a turn only emits text_complete segments', async () => {
    const orchestrator = new AgentOrchestrator(
      new TextCompleteOnlyAssistantAdapter(),
      new AgentEventBus(),
    )
    const session = createAgentSession('Text complete only session')

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '请根据刚确认的 CMS 选择结果，判断如何应用到当前目标。',
        channelId: '',
      },
      {
        onError: (message) => {
          throw new Error(`unexpected onError: ${message}`)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    const persistedAssistant = getAgentSessionMessages(session.id).findLast(
      (message) => message.role === 'assistant',
    )

    expect(persistedAssistant?.content).toBe(
      '我已分析你的 CMS 绑定请求。现在准备应用变更。✅ CMS 内容绑定已成功应用！',
    )
  })

  test('does not duplicate text that already arrived through text_delta before text_complete', async () => {
    const orchestrator = new AgentOrchestrator(
      new MixedAssistantTextAdapter(),
      new AgentEventBus(),
    )
    const session = createAgentSession('Mixed assistant text session')

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '继续处理当前绑定。',
        channelId: '',
      },
      {
        onError: (message) => {
          throw new Error(`unexpected onError: ${message}`)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    const persistedAssistant = getAgentSessionMessages(session.id).findLast(
      (message) => message.role === 'assistant',
    )

    expect(persistedAssistant?.content).toBe('前置说明：最终总结：绑定成功。')
  })
})
