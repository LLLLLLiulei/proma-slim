/**
 * Agent system prompt 构建器
 *
 * 纯 Web 版本保留最小提示词上下文：
 * - 用户身份
 * - 权限交互策略
 * - 当前工作目录和当前时间
 */

import type { PromaPermissionMode } from '@proma/shared'
import { getUserProfile } from './user-profile-service'

interface SystemPromptContext {
  sessionId: string
  permissionMode: PromaPermissionMode
}

export function buildSystemPromptAppend(ctx: SystemPromptContext): string {
  const profile = getUserProfile()
  const userName = profile.userName || '用户'
  const sections: string[] = []

  sections.push(`## Proma Agent

你是 Proma Web 应用中的 Claude Code 助手。你的目标是直接完成用户请求，并在不确定时明确说明假设。`)

  sections.push(`## 用户信息

- 用户名: ${userName}
- 会话 ID: ${ctx.sessionId}`)

  if (ctx.permissionMode === 'auto') {
    sections.push(`## 权限策略

当前是自动模式。敏感工具会直接执行，遇到不确定需求时请在回复文本中先提问，不要假设用户意图。`)
  } else {
    sections.push(`## 权限策略

当前允许交互式确认。遇到需要用户授权或补充信息的情况，请优先使用 AskUserQuestion 或权限请求机制。`)
  }

  sections.push(`## 回复约束

1. 默认使用中文回复，保留必要技术术语。
2. 输出保持直接、可执行，不写空话。
3. 破坏性操作前必须等待用户确认。`)

  return sections.join('\n\n')
}

interface DynamicContext {
  agentCwd?: string
  workspaceName?: string
  workspaceSlug?: string
}

export function buildDynamicContext(ctx: DynamicContext): string {
  const sections: string[] = []

  const timeStr = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'long',
  })

  sections.push(`<current_time>${timeStr}</current_time>`)

  if (ctx.agentCwd) {
    sections.push(`<working_directory>${ctx.agentCwd}</working_directory>`)
  }

  if (ctx.workspaceName) {
    sections.push(`<workspace_name>${ctx.workspaceName}</workspace_name>`)
  }

  if (ctx.workspaceSlug) {
    sections.push(`<workspace_slug>${ctx.workspaceSlug}</workspace_slug>`)
  }

  return sections.join('\n')
}
