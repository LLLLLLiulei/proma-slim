/**
 * Agent Provider 适配器接口
 *
 * 定义 Proma 自己的 Agent 接口层，让底层 SDK 可替换。
 * 当前实现：ClaudeAgentAdapter（基于 @anthropic-ai/claude-agent-sdk）
 * 未来可扩展：PiAgentAdapter 等。
 */

import type { AgentEvent } from './agent'

export interface AgentSdkTextContentBlock {
  type: 'text'
  text: string
}

export interface AgentSdkMessageParam {
  role: 'user'
  content: string | AgentSdkTextContentBlock[]
}

export interface AgentSdkUserMessage {
  type: 'user'
  message: AgentSdkMessageParam
  parent_tool_use_id: string | null
  session_id: string
  isSynthetic?: boolean
  tool_use_result?: unknown
  priority?: 'now' | 'next' | 'later'
  uuid?: string
}

export interface AgentSdkMcpServerConfig {
  type: 'sdk'
  name: string
  instance: unknown
}

export type AgentPromptInput = string | AsyncIterable<AgentSdkUserMessage>
export type AgentMcpServerConfig = Record<string, unknown> | AgentSdkMcpServerConfig

/**
 * Agent 查询输入（Provider 无关）
 *
 * 包含所有 Provider 都需要的通用字段。
 * SDK 特定配置通过 Adapter 的扩展输入类型传入。
 */
export interface AgentQueryInput {
  /** 会话 ID */
  sessionId: string
  /** 用户 prompt（已包含上下文注入） */
  prompt: AgentPromptInput
  /** 模型 ID */
  model?: string
  /** 本次请求传入 Agent SDK 的运行时环境变量 */
  env?: Record<string, string | undefined>
  /** Agent 工作目录 */
  cwd?: string
  /** 中止信号 */
  abortSignal?: AbortSignal
}

/**
 * Agent Provider 适配器接口
 *
 * 职责：接收查询输入，返回 AgentEvent 异步迭代流。
 * 内部负责 SDK 消息到 AgentEvent 的翻译，外部无需了解 SDK 细节。
 */
export interface AgentProviderAdapter {
  /** 发起查询，返回 AgentEvent 异步迭代流 */
  query(input: AgentQueryInput): AsyncIterable<AgentEvent>
  /** 中止指定会话的执行 */
  abort(sessionId: string): void
  /** 释放资源 */
  dispose(): void
}
