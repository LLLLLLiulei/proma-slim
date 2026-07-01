import { describe, expect, test } from 'bun:test'
import type { AgentEvent } from '@ai-page-builder/shared'
import { reconstructAssistantContent } from './agent-assistant-content'

describe('agent assistant content reconstruction', () => {
  test('does not duplicate a streamed segment when a tool event arrives before text_complete', () => {
    const events: AgentEvent[] = [
      { type: 'text_delta', text: '我先看下当前选中的图片。' },
      {
        type: 'tool_start',
        toolName: 'Grep',
        toolUseId: 'tool-1',
        input: {},
      },
      {
        type: 'text_complete',
        text: '我先看下当前选中的图片。',
        isIntermediate: true,
      },
      {
        type: 'tool_result',
        toolUseId: 'tool-1',
        toolName: 'Grep',
        result: 'ok',
        isError: false,
      },
      { type: 'text_delta', text: '已换好。' },
      {
        type: 'text_complete',
        text: '已换好。',
        isIntermediate: false,
      },
    ]

    expect(reconstructAssistantContent('', events)).toBe('我先看下当前选中的图片。已换好。')
  })

  test('separates streamed assistant text segments with different turn ids', () => {
    const events: AgentEvent[] = [
      { type: 'text_delta', text: '好的！我先看看当前工作区是否已有页面。', turnId: 'turn-1' },
      {
        type: 'tool_start',
        toolName: 'Glob',
        toolUseId: 'tool-1',
        input: {},
        turnId: 'turn-1',
      },
      {
        type: 'text_complete',
        text: '好的！我先看看当前工作区是否已有页面。',
        isIntermediate: true,
        turnId: 'turn-1',
      },
      {
        type: 'tool_result',
        toolUseId: 'tool-1',
        toolName: 'Glob',
        result: 'ok',
        isError: false,
        turnId: 'turn-1',
      },
      { type: 'text_delta', text: '好的，当前是空白工作区，我们从零开始。', turnId: 'turn-2' },
      {
        type: 'text_complete',
        text: '好的，当前是空白工作区，我们从零开始。',
        isIntermediate: true,
        turnId: 'turn-2',
      },
    ]

    expect(reconstructAssistantContent('', events)).toBe(
      '好的！我先看看当前工作区是否已有页面。\n\n好的，当前是空白工作区，我们从零开始。',
    )
  })

  test('separates text-complete-only assistant segments with different turn ids', () => {
    const events: AgentEvent[] = [
      {
        type: 'text_complete',
        text: '确认通过，现在开始生成页面。',
        isIntermediate: true,
        turnId: 'turn-1',
      },
      {
        type: 'text_complete',
        text: '现在开始生成企业数字化转型课程推广专题页面。',
        isIntermediate: true,
        turnId: 'turn-2',
      },
    ]

    expect(reconstructAssistantContent('', events)).toBe(
      '确认通过，现在开始生成页面。\n\n现在开始生成企业数字化转型课程推广专题页面。',
    )
  })
})
