/**
 * Agent 会话管理器
 *
 * 负责 Agent 会话的 CRUD 操作和消息持久化。
 * - 会话索引：~/.proma/agent-sessions.json（轻量元数据）
 * - 消息存储：~/.proma/agent-sessions/{id}.jsonl（JSONL 格式，逐行追加）
 *
 * 照搬 conversation-manager.ts 的模式。
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, rmSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import {
  getAgentSessionWorkspacePath,
  getAgentSessionsIndexPath,
  getAgentSessionsDir,
  getAgentSessionMessagesPath,
} from './config-paths'
import type { AgentSessionMeta, AgentMessage } from '@proma/shared'
import {
  ensureDefaultWorkspace,
  getAgentWorkspace,
  moveWorkspaceSessionDirectory,
} from './workspace-service'

/**
 * 会话索引文件格式
 */
interface AgentSessionsIndex {
  /** 配置版本号 */
  version: number
  /** 会话元数据列表 */
  sessions: AgentSessionMeta[]
}

/** 当前索引版本 */
const INDEX_VERSION = 1

/**
 * 读取会话索引文件
 */
function readIndex(): AgentSessionsIndex {
  const indexPath = getAgentSessionsIndexPath()

  if (!existsSync(indexPath)) {
    return { version: INDEX_VERSION, sessions: [] }
  }

  try {
    const raw = readFileSync(indexPath, 'utf-8')
    const index = JSON.parse(raw) as AgentSessionsIndex
    let mutated = false
    const defaultWorkspace = ensureDefaultWorkspace()

    index.sessions = index.sessions.map((session) => {
      if (session.workspaceId) return session

      mutated = true
      const updated: AgentSessionMeta = {
        ...session,
        workspaceId: defaultWorkspace.id,
      }
      getAgentSessionWorkspacePath(defaultWorkspace.slug, session.id)
      return updated
    })

    if (mutated) {
      writeIndex(index)
    }

    return index
  } catch (error) {
    console.error('[Agent 会话] 读取索引文件失败:', error)
    return { version: INDEX_VERSION, sessions: [] }
  }
}

/**
 * 写入会话索引文件
 */
function writeIndex(index: AgentSessionsIndex): void {
  const indexPath = getAgentSessionsIndexPath()

  try {
    writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8')
  } catch (error) {
    console.error('[Agent 会话] 写入索引文件失败:', error)
    throw new Error('写入 Agent 会话索引失败')
  }
}

/**
 * 获取所有会话（按 updatedAt 降序）
 */
export function listAgentSessions(): AgentSessionMeta[] {
  const index = readIndex()
  return index.sessions.sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * 获取单个会话的元数据
 */
export function getAgentSessionMeta(id: string): AgentSessionMeta | undefined {
  const index = readIndex()
  return index.sessions.find((s) => s.id === id)
}

/**
 * 创建新会话
 */
export function createAgentSession(
  title?: string,
  channelId?: string,
  workspaceId?: string,
): AgentSessionMeta {
  const index = readIndex()
  const now = Date.now()
  const resolvedWorkspaceId = workspaceId ?? ensureDefaultWorkspace().id

  const meta: AgentSessionMeta = {
    id: randomUUID(),
    title: title || '新 Agent 会话',
    channelId,
    workspaceId: resolvedWorkspaceId,
    createdAt: now,
    updatedAt: now,
  }

  index.sessions.push(meta)
  writeIndex(index)

  // 确保消息目录存在
  getAgentSessionsDir()
  const workspace = getAgentWorkspace(resolvedWorkspaceId)
  if (workspace) {
    getAgentSessionWorkspacePath(workspace.slug, meta.id)
  }

  console.log(`[Agent 会话] 已创建会话: ${meta.title} (${meta.id})`)
  return meta
}

/**
 * 读取会话的所有消息
 */
export function getAgentSessionMessages(id: string): AgentMessage[] {
  const filePath = getAgentSessionMessagesPath(id)

  if (!existsSync(filePath)) {
    return []
  }

  try {
    const raw = readFileSync(filePath, 'utf-8')
    const lines = raw.split('\n').filter((line) => line.trim())
    return lines.map((line) => JSON.parse(line) as AgentMessage)
  } catch (error) {
    console.error(`[Agent 会话] 读取消息失败 (${id}):`, error)
    return []
  }
}

/**
 * 追加一条消息到会话的 JSONL 文件
 */
export function appendAgentMessage(id: string, message: AgentMessage): void {
  const filePath = getAgentSessionMessagesPath(id)

  try {
    const line = JSON.stringify(message) + '\n'
    appendFileSync(filePath, line, 'utf-8')
  } catch (error) {
    console.error(`[Agent 会话] 追加消息失败 (${id}):`, error)
    throw new Error('追加 Agent 消息失败')
  }
}

/**
 * 更新会话元数据
 */
export function updateAgentSessionMeta(
  id: string,
  updates: Partial<Pick<AgentSessionMeta, 'title' | 'channelId' | 'sdkSessionId' | 'workspaceId' | 'pinned' | 'attachedDirectories'>>,
): AgentSessionMeta {
  const index = readIndex()
  const idx = index.sessions.findIndex((s) => s.id === id)

  if (idx === -1) {
    throw new Error(`Agent 会话不存在: ${id}`)
  }

  const existing = index.sessions[idx]!
  const updated: AgentSessionMeta = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  }

  index.sessions[idx] = updated
  writeIndex(index)

  console.log(`[Agent 会话] 已更新会话: ${updated.title} (${updated.id})`)
  return updated
}

/**
 * 删除会话
 */
export function deleteAgentSession(id: string): void {
  const index = readIndex()
  const idx = index.sessions.findIndex((s) => s.id === id)

  if (idx === -1) {
    throw new Error(`Agent 会话不存在: ${id}`)
  }

  const removed = index.sessions.splice(idx, 1)[0]!
  writeIndex(index)

  // 删除消息文件
  const filePath = getAgentSessionMessagesPath(id)
  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath)
    } catch (error) {
      console.warn(`[Agent 会话] 删除消息文件失败 (${id}):`, error)
    }
  }

  if (removed.workspaceId) {
    const workspace = getAgentWorkspace(removed.workspaceId)
    if (workspace) {
      const sessionDir = getAgentSessionWorkspacePath(workspace.slug, id)
      rmSync(sessionDir, { recursive: true, force: true })
    }
  }

  console.log(`[Agent 会话] 已删除会话: ${removed.title} (${removed.id})`)
}

/**
 * 迁移 Agent 会话到另一个工作区
 */
export function moveSessionToWorkspace(sessionId: string, targetWorkspaceId: string): AgentSessionMeta {
  const index = readIndex()
  const idx = index.sessions.findIndex((session) => session.id === sessionId)

  if (idx === -1) {
    throw new Error(`Agent 会话不存在: ${sessionId}`)
  }

  const session = index.sessions[idx]!
  if (session.workspaceId === targetWorkspaceId) {
    return session
  }

  const targetWorkspace = getAgentWorkspace(targetWorkspaceId)
  if (!targetWorkspace) {
    throw new Error(`目标工作区不存在: ${targetWorkspaceId}`)
  }

  const sourceWorkspace = session.workspaceId ? getAgentWorkspace(session.workspaceId) : null
  moveWorkspaceSessionDirectory(sessionId, sourceWorkspace?.slug ?? null, targetWorkspace.slug)

  const updated: AgentSessionMeta = {
    ...session,
    workspaceId: targetWorkspaceId,
    sdkSessionId: undefined,
    updatedAt: Date.now(),
  }

  index.sessions[idx] = updated
  writeIndex(index)

  console.log(`[Agent 会话] 已迁移会话到工作区: ${sessionId} -> ${targetWorkspace.slug}`)
  return updated
}
