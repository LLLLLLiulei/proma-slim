/**
 * Agent 服务层
 *
 * 职责：
 * - 创建 AgentOrchestrator / EventBus / Adapter 实例
 * - 将 EventBus 事件转发到 SSE 管理器
 * - 导出 HTTP 路由可调用的薄包装函数
 * - 文件操作（saveFilesToAgentSession）
 */

import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  AgentGenerateTitleInput,
  AgentSaveFilesInput,
  AgentSaveWorkspaceFilesInput,
  AgentSavedFile,
  AgentSendInput,
  AgentMessage,
} from '@proma/shared'
import { sseManager } from '../sse-manager'
import { ClaudeAgentAdapter } from './adapters/claude-agent-adapter'
import { AgentEventBus } from './agent-event-bus'
import { AgentOrchestrator, type SessionCallbacks } from './agent-orchestrator'
import { getAgentSessionWorkspacePath, getWorkspaceFilesDir } from './config-paths'

const eventBus = new AgentEventBus()
const adapter = new ClaudeAgentAdapter()
const orchestrator = new AgentOrchestrator(adapter, eventBus)

eventBus.on((sessionId, event) => {
  sseManager.emitAgentEvent(sessionId, event)
})

export { eventBus as agentEventBus }

export async function runAgent(
  input: AgentSendInput,
  callbacks: SessionCallbacks,
): Promise<void> {
  await orchestrator.sendMessage(input, callbacks)
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

export function saveFilesToAgentSession(input: AgentSaveFilesInput): AgentSavedFile[] {
  const sessionDir = getAgentSessionWorkspacePath(input.workspaceSlug, input.sessionId)
  const results: AgentSavedFile[] = []
  const usedPaths = new Set<string>()

  for (const file of input.files) {
    let targetPath = join(sessionDir, file.filename)

    if (usedPaths.has(targetPath) || existsSync(targetPath)) {
      const dotIdx = file.filename.lastIndexOf('.')
      const baseName = dotIdx > 0 ? file.filename.slice(0, dotIdx) : file.filename
      const ext = dotIdx > 0 ? file.filename.slice(dotIdx) : ''
      let counter = 1
      let candidate = join(sessionDir, `${baseName}-${counter}${ext}`)

      while (usedPaths.has(candidate) || existsSync(candidate)) {
        counter++
        candidate = join(sessionDir, `${baseName}-${counter}${ext}`)
      }

      targetPath = candidate
    }

    usedPaths.add(targetPath)
    mkdirSync(dirname(targetPath), { recursive: true })

    const buffer = Buffer.from(file.data, 'base64')
    writeFileSync(targetPath, buffer)

    results.push({
      filename: targetPath.slice(sessionDir.length + 1),
      targetPath,
    })
  }

  return results
}

export function saveFilesToWorkspaceFiles(input: AgentSaveWorkspaceFilesInput): AgentSavedFile[] {
  const workspaceFilesDir = getWorkspaceFilesDir(input.workspaceSlug)
  const results: AgentSavedFile[] = []
  const usedPaths = new Set<string>()

  for (const file of input.files) {
    let targetPath = join(workspaceFilesDir, file.filename)

    if (usedPaths.has(targetPath) || existsSync(targetPath)) {
      const dotIdx = file.filename.lastIndexOf('.')
      const baseName = dotIdx > 0 ? file.filename.slice(0, dotIdx) : file.filename
      const ext = dotIdx > 0 ? file.filename.slice(dotIdx) : ''
      let counter = 1
      let candidate = join(workspaceFilesDir, `${baseName}-${counter}${ext}`)

      while (usedPaths.has(candidate) || existsSync(candidate)) {
        counter++
        candidate = join(workspaceFilesDir, `${baseName}-${counter}${ext}`)
      }

      targetPath = candidate
    }

    usedPaths.add(targetPath)
    mkdirSync(dirname(targetPath), { recursive: true })

    const buffer = Buffer.from(file.data, 'base64')
    writeFileSync(targetPath, buffer)

    results.push({
      filename: targetPath.slice(workspaceFilesDir.length + 1),
      targetPath,
    })
  }

  return results
}
