/**
 * Agent 服务层
 *
 * 职责：
 * - 创建 AgentOrchestrator / EventBus / Adapter 实例
 * - 将 EventBus 事件转发到 SSE 管理器
 * - 导出 HTTP 路由可调用的薄包装函数
 */

import type {
  AgentGenerateTitleInput,
  AgentSendInput,
} from '@ai-page-builder/shared'
import type { AgentSendDiagnosticContext } from './diagnostic-logging'
import { sseManager } from '../sse-manager'
import { ClaudeAgentAdapter } from './adapters/claude-agent-adapter'
import { AgentEventBus } from './agent-event-bus'
import { AgentOrchestrator, type AgentOrchestratorSendInput, type SessionCallbacks } from './agent-orchestrator'

const eventBus = new AgentEventBus()
const adapter = new ClaudeAgentAdapter()
const orchestrator = new AgentOrchestrator(adapter, eventBus)

eventBus.on((sessionId, event) => {
  sseManager.emitAgentEvent(sessionId, event)
})

export { eventBus as agentEventBus }

export async function runAgent(
  input: AgentOrchestratorSendInput,
  callbacks: SessionCallbacks,
  diagnostic?: AgentSendDiagnosticContext,
): Promise<void> {
  await orchestrator.sendMessage(input, callbacks, diagnostic)
}

export async function generateAgentTitle(input: AgentGenerateTitleInput): Promise<string | null> {
  return orchestrator.generateTitle(input)
}

export function stopAgent(sessionId: string): void {
  orchestrator.stop(sessionId)
}

export function isAgentSessionActive(sessionId: string): boolean {
  return orchestrator.isActive(sessionId)
}

export function stopAllAgents(): void {
  orchestrator.stopAll()
}
