import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ToolActivity } from '@/atoms/agent-atoms'
import { ActivityRow } from './ToolActivityItem'

function createActivity(overrides: Partial<ToolActivity>): ToolActivity {
  return {
    toolUseId: 'tool-1',
    toolName: 'Bash',
    input: {},
    done: true,
    ...overrides,
  }
}

function renderActivity(activity: ToolActivity): string {
  return renderToStaticMarkup(<ActivityRow activity={activity} />)
}

describe('ToolActivityItem', () => {
  test('renders known built-in tool names in Chinese', () => {
    const markup = renderActivity(createActivity({
      toolName: 'AskUserQuestion',
      input: { question: '下一步怎么处理？' },
    }))

    expect(markup).toContain('问题澄清')
    expect(markup).not.toContain('AskUserQuestion')
  })

  test('renders first-party MCP tool names in Chinese', () => {
    const markup = renderActivity(createActivity({
      toolName: 'mcp__cms__apply_cms_binding',
      input: { decisionId: 'decision-1' },
    }))

    expect(markup).toContain('CMS / 应用 CMS 绑定')
    expect(markup).not.toContain('mcp__cms__apply_cms_binding')
  })

  test('renders Playwright MCP tool names in Chinese', () => {
    const markup = renderActivity(createActivity({
      toolName: 'mcp__playwright__browser_navigate',
      input: { url: 'https://example.com' },
    }))

    expect(markup).toContain('浏览器自动化 / 打开页面')
    expect(markup).not.toContain('mcp__playwright__browser_navigate')
  })

  test('renders known skill invocations in Chinese after workspace prefix normalization', () => {
    const markup = renderActivity(createActivity({
      toolName: 'Skill',
      input: { skill: '550e8400-e29b-41d4-a716-446655440000:page-builder-guided-generation' },
    }))

    expect(markup).toContain('使用技能')
    expect(markup).toContain('页面引导生成')
    expect(markup).not.toContain('page-builder-guided-generation')
  })

  test('preserves unmapped skill invocation names as-is', () => {
    const markup = renderActivity(createActivity({
      toolName: 'Skill',
      input: { skill: 'workspace-1:custom-skill' },
    }))

    expect(markup).toContain('workspace-1:custom-skill')
  })

  test('preserves unmapped tool names as-is', () => {
    const markup = renderActivity(createActivity({
      toolName: 'CustomTool',
      input: { value: 1 },
    }))

    expect(markup).toContain('CustomTool')
  })
})
