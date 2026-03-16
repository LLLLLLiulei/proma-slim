/**
 * Agent Atoms — Agent 模式的 Jotai 状态管理
 *
 * 管理 Agent 会话列表、当前会话、消息、流式状态等。
 * 模式照搬 chat-atoms.ts。
 */

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type {
  AgentEvent,
  AgentSessionMeta,
  AgentWorkspace,
  AskUserRequest,
  PermissionRequest,
  RetryAttempt,
  TaskUsage,
  WorkspaceCapabilities,
  WorkspaceDirectoryContext,
} from '@proma/shared'

/** 活动状态 */
export type ActivityStatus = 'pending' | 'running' | 'completed' | 'error' | 'backgrounded'

/** 工具活动状态 */
export interface ToolActivity {
  toolUseId: string
  toolName: string
  input: Record<string, unknown>
  intent?: string
  displayName?: string
  result?: string
  isError?: boolean
  done: boolean
  parentToolUseId?: string
  elapsedSeconds?: number
  taskId?: string
  shellId?: string
  isBackground?: boolean
}

/** 活动分组（Task 子代理） */
export interface ActivityGroup {
  parent: ToolActivity
  children: ToolActivity[]
}

/** Teammate 状态枚举 */
type TeammateStatus = 'running' | 'completed' | 'failed' | 'stopped'

/** 单个 teammate 的实时状态（Agent Teams 功能） */
interface TeammateState {
  /** SDK task_id */
  taskId: string
  /** 关联的 tool_use_id（Task 工具调用 ID） */
  toolUseId?: string
  /** 任务描述（spawn 时 Claude 给出的说明） */
  description: string
  /** 任务类型（SDK 内部类型，如 in_process_teammate） */
  taskType?: string
  /** 在当前对话中的序号（从 1 开始） */
  index: number
  /** 当前状态 */
  status: TeammateStatus
  /** 最近一次 task_progress 的描述（实时思考内容） */
  progressDescription?: string
  /** 当前正在运行的工具名 */
  currentToolName?: string
  /** 当前工具已运行秒数 */
  currentToolElapsedSeconds?: number
  /** 当前工具 toolUseId */
  currentToolUseId?: string
  /** 已使用的工具历史记录（最近 N 个，去重） */
  toolHistory: string[]
  /** 完成时的摘要 */
  summary?: string
  /** 完成时输出文件路径 */
  outputFile?: string
  /** 累计用量 */
  usage?: TaskUsage
  /** 开始时间戳 */
  startedAt: number
  /** 结束时间戳 */
  endedAt?: number
}

/** 工具历史最大记录数 */
const MAX_TOOL_HISTORY = 20

/** Agent 会话的流式状态 */
export interface AgentStreamState {
  running: boolean
  content: string
  toolActivities: ToolActivity[]
  model?: string
  /** 当前输入 token 数（上下文使用量） */
  inputTokens?: number
  /** 模型上下文窗口大小 */
  contextWindow?: number
  /** 是否正在压缩上下文 */
  isCompacting?: boolean
  /** 流式开始时间戳（用于思考计时持久化） */
  startedAt?: number
  /** 重试状态（扩展版） */
  retrying?: {
    /** 当前第几次尝试 */
    currentAttempt: number
    /** 最大尝试次数 */
    maxAttempts: number
    /** 重试历史记录（按时间顺序） */
    history: RetryAttempt[]
    /** 是否已失败 */
    failed: boolean
  }
  /** Agent Teams: teammate 状态列表 */
  teammates: TeammateState[]
  /** 是否等待 auto-resume（teammate 结果收集中） */
  waitingResume?: boolean
}

/** 从 ToolActivity 派生状态 */
export function getActivityStatus(activity: ToolActivity): ActivityStatus {
  if (activity.isBackground) return 'backgrounded'
  if (!activity.done) return 'running'
  if (activity.isError) return 'error'
  return 'completed'
}

/**
 * 合并同层 TodoWrite 活动：多次调用只保留最新 input，置底显示
 *
 * TodoWrite 每次调用都包含完整的 todo 列表，只需展示最新状态。
 */
function mergeTodoWrites(activities: ToolActivity[]): ToolActivity[] {
  const todoWrites: ToolActivity[] = []
  const others: ToolActivity[] = []

  for (const a of activities) {
    if (a.toolName === 'TodoWrite') {
      todoWrites.push(a)
    } else {
      others.push(a)
    }
  }

  if (todoWrites.length === 0) return activities

  const latest = todoWrites[todoWrites.length - 1]!
  const allDone = todoWrites.every((t) => t.done)

  const merged: ToolActivity = {
    ...latest,
    done: allDone,
    isError: allDone && todoWrites.some((t) => t.isError),
  }

  return [...others, merged]
}

/**
 * 将扁平活动列表按 parentToolUseId 分组
 *
 * 返回顶层项（ActivityGroup | ToolActivity），
 * Task 类型的工具作为 group.parent，其子活动嵌套在 children 中。
 * 每层内 TodoWrite 合并去重并置底。
 */
export function groupActivities(activities: ToolActivity[]): Array<ActivityGroup | ToolActivity> {
  // 过滤幽灵条目：tool_progress 创建的空 input 条目，完成后仍无内容
  const filtered = activities.filter((a) => {
    if (a.done && Object.keys(a.input).length === 0 && !a.result) return false
    return true
  })
  const processed = mergeTodoWrites(filtered)

  const parentIds = new Set<string>()
  for (const a of processed) {
    if (a.toolName === 'Task') parentIds.add(a.toolUseId)
  }

  const childrenMap = new Map<string, ToolActivity[]>()
  const topLevel: Array<ActivityGroup | ToolActivity> = []

  for (const a of processed) {
    if (a.parentToolUseId && parentIds.has(a.parentToolUseId)) {
      const children = childrenMap.get(a.parentToolUseId) ?? []
      children.push(a)
      childrenMap.set(a.parentToolUseId, children)
    } else {
      topLevel.push(a)
    }
  }

  return topLevel.map((item) => {
    if ('toolUseId' in item && parentIds.has(item.toolUseId)) {
      const children = childrenMap.get(item.toolUseId) ?? []
      return { parent: item, children: mergeTodoWrites(children) } as ActivityGroup
    }
    return item
  })
}

/** 判断是否为 ActivityGroup */
export function isActivityGroup(item: ActivityGroup | ToolActivity): item is ActivityGroup {
  return 'parent' in item && 'children' in item
}

// ===== Atoms =====

export const agentSessionsAtom = atom<AgentSessionMeta[]>([])
export const agentWorkspacesAtom = atom<AgentWorkspace[]>([])
export const currentAgentSessionIdAtom = atomWithStorage<string | null>('proma-current-agent-session-id', null)
export const currentAgentWorkspaceIdAtom = atomWithStorage<string | null>('proma-current-agent-workspace-id', null)
export const agentStreamingStatesAtom = atom<Map<string, AgentStreamState>>(new Map())
export const workspaceCapabilitiesMapAtom = atom<Map<string, WorkspaceCapabilities>>(new Map())
export const workspaceDirectoryContextMapAtom = atom<Map<string, WorkspaceDirectoryContext>>(new Map())

/** 待处理的权限请求 Map — 以 sessionId 为 key，切换会话时保留状态 */
export const allPendingPermissionRequestsAtom = atom<Map<string, readonly PermissionRequest[]>>(new Map())

/** 待处理的 AskUser 请求 Map — 以 sessionId 为 key，切换会话时保留状态 */
export const allPendingAskUserRequestsAtom = atom<Map<string, readonly AskUserRequest[]>>(new Map())

export const agentRunningSessionIdsAtom = atom<Set<string>>((get) => {
  const states = get(agentStreamingStatesAtom)
  const ids = new Set<string>()
  for (const [id, state] of states) {
    if (state.running) ids.add(id)
  }
  return ids
})

/**
 * 追加工具名到历史记录（不可变版本）
 * 相同工具不连续重复，超出上限则删除最旧的
 */
function appendToolHistory(history: string[], toolName: string): string[] {
  if (history[history.length - 1] === toolName) return history
  const next = [...history, toolName]
  return next.length > MAX_TOOL_HISTORY ? next.slice(next.length - MAX_TOOL_HISTORY) : next
}

/**
 * 处理 AgentEvent 并更新流式状态（纯函数）
 */
export function applyAgentEvent(
  prev: AgentStreamState,
  event: AgentEvent,
): AgentStreamState {
  switch (event.type) {
    case 'text_delta':
      // 开始接收文本 - 清除重试状态（重试成功）
      return { ...prev, content: prev.content + event.text, retrying: undefined }

    case 'text_complete':
      // 用完整文本替换增量累积的文本（用于回放场景：只需 text_complete 即可重建文本状态）
      return { ...prev, content: event.text }

    case 'tool_start': {
      const existing = prev.toolActivities.find((t) => t.toolUseId === event.toolUseId)
      if (existing) {
        return {
          ...prev,
          toolActivities: prev.toolActivities.map((t) =>
            t.toolUseId === event.toolUseId
              ? { ...t, input: event.input, intent: event.intent || t.intent, displayName: event.displayName || t.displayName }
              : t
          ),
          // 开始工具调用 - 清除重试状态（重试成功）
          retrying: undefined,
        }
      }
      return {
        ...prev,
        toolActivities: [...prev.toolActivities, {
          toolUseId: event.toolUseId,
          toolName: event.toolName,
          input: event.input,
          intent: event.intent,
          displayName: event.displayName,
          done: false,
          parentToolUseId: event.parentToolUseId,
        }],
        // 开始工具调用 - 清除重试状态（重试成功）
        retrying: undefined,
      }
    }

    case 'tool_result':
      return {
        ...prev,
        toolActivities: prev.toolActivities.map((t) =>
          t.toolUseId === event.toolUseId
            ? { ...t, result: event.result, isError: event.isError, done: true }
            : t
        ),
      }

    case 'task_backgrounded':
      return {
        ...prev,
        toolActivities: prev.toolActivities.map((t) =>
          t.toolUseId === event.toolUseId
            ? { ...t, isBackground: true, taskId: event.taskId, done: true }
            : t
        ),
      }

    case 'task_progress':
      // Teams 级别的 teammate 进度（带 taskId）
      if (event.taskId) {
        const tmIdx = prev.teammates.findIndex((t) => t.taskId === event.taskId)
        if (tmIdx >= 0) {
          const tm = prev.teammates[tmIdx]!
          const updatedTm: TeammateState = {
            ...tm,
            progressDescription: event.description ?? tm.progressDescription,
            usage: event.usage ?? tm.usage,
            // 更新当前工具名和计时（来自 tool_progress 或 system task_progress）
            ...(event.lastToolName && {
              currentToolName: event.lastToolName,
              currentToolElapsedSeconds: event.elapsedSeconds ?? tm.currentToolElapsedSeconds,
              currentToolUseId: event.toolUseId,
              toolHistory: appendToolHistory(tm.toolHistory, event.lastToolName),
            }),
            // 无 lastToolName 但有真实 elapsedSeconds 时仅更新计时
            ...(!event.lastToolName && event.elapsedSeconds != null && {
              currentToolElapsedSeconds: event.elapsedSeconds,
            }),
            // 主对话仍在运行时，收到进度说明 teammate 实际仍在工作，重置 stopped/failed
            // 主对话已结束时（running: false），不重置（防止建议信息等后续事件错误唤醒）
            ...(prev.running && (tm.status === 'stopped' || tm.status === 'failed')
              ? { status: 'running' as const, endedAt: undefined }
              : {}),
          }
          const nextTeammates = [...prev.teammates]
          nextTeammates[tmIdx] = updatedTm
          return { ...prev, teammates: nextTeammates }
        }
      }
      // 普通 tool 计时语义（仅当有真实 elapsedSeconds 时更新）
      if (event.elapsedSeconds != null) {
        return {
          ...prev,
          toolActivities: prev.toolActivities.map((t) =>
            t.toolUseId === event.toolUseId
              ? { ...t, elapsedSeconds: event.elapsedSeconds! }
              : t
          ),
        }
      }
      return prev

    case 'task_started': {
      // 查找匹配 toolUseId 的 ToolActivity，更新 intent 和 taskId
      let nextActivities = prev.toolActivities
      if (event.toolUseId) {
        const idx = prev.toolActivities.findIndex((t) => t.toolUseId === event.toolUseId)
        if (idx >= 0) {
          nextActivities = prev.toolActivities.map((t) =>
            t.toolUseId === event.toolUseId
              ? { ...t, intent: event.description, taskId: event.taskId }
              : t
          )
        }
      }
      // 去重：已有同 taskId 的 teammate 时仅更新 activities
      if (prev.teammates.some((t) => t.taskId === event.taskId)) {
        return { ...prev, toolActivities: nextActivities }
      }
      // 创建 TeammateState
      const newTeammate: TeammateState = {
        taskId: event.taskId,
        toolUseId: event.toolUseId,
        description: event.description,
        taskType: event.taskType,
        index: prev.teammates.length + 1,
        status: 'running',
        toolHistory: [],
        startedAt: Date.now(),
      }
      return {
        ...prev,
        toolActivities: nextActivities,
        teammates: [...prev.teammates, newTeammate],
      }
    }

    case 'shell_backgrounded':
      return {
        ...prev,
        toolActivities: prev.toolActivities.map((t) =>
          t.toolUseId === event.toolUseId
            ? { ...t, isBackground: true, shellId: event.shellId, done: true }
            : t
        ),
      }

    case 'shell_killed':
      return prev

    case 'task_notification': {
      // Agent Teams: teammate 完成/失败/停止
      const nextTeammates = [...prev.teammates]
      let tmIdx = nextTeammates.findIndex((t) => t.taskId === event.taskId)
      if (tmIdx < 0) {
        // task_started 丢失时的兜底：从 notification 补创 teammate
        nextTeammates.push({
          taskId: event.taskId,
          toolUseId: event.toolUseId,
          description: event.summary || event.taskId,
          index: nextTeammates.length + 1,
          status: 'running',
          toolHistory: [],
          startedAt: Date.now(),
        })
        tmIdx = nextTeammates.length - 1
      }
      nextTeammates[tmIdx] = {
        ...nextTeammates[tmIdx]!,
        status: event.status,
        summary: event.summary,
        outputFile: event.outputFile,
        endedAt: Date.now(),
        ...(event.usage && { usage: event.usage }),
        // 任务结束后清除实时工具状态
        currentToolName: undefined,
        currentToolElapsedSeconds: undefined,
        currentToolUseId: undefined,
      }
      return { ...prev, teammates: nextTeammates }
    }

    case 'tool_use_summary':
      // 工具使用摘要 — 目前不影响流式状态，仅用于 UI 展示
      return prev

    case 'waiting_resume':
      return { ...prev, waitingResume: true }

    case 'resume_start':
      return { ...prev, waitingResume: false }

    case 'complete':
      // 成功完成 — 清除 retrying，但保持 running: true
      // 等待 STREAM_COMPLETE IPC 回调通过删除流式状态来控制 UI 就绪状态
      // 这避免了用户在后端尚未完成清理时就能发送新消息的竞态条件
      // 同时将仍 running 的 teammates 标记为 stopped（兜底）
      return {
        ...prev,
        retrying: undefined,
        teammates: prev.teammates.map((tm) =>
          tm.status === 'running'
            ? { ...tm, status: 'stopped' as const, endedAt: Date.now(), currentToolName: undefined, currentToolElapsedSeconds: undefined, currentToolUseId: undefined }
            : tm
        ),
      }

    case 'typed_error':
      // 处理类型化错误（TypedError）
      // 停止运行，清除重试状态
      return { ...prev, running: false, retrying: undefined }

    case 'error':
      // 改进：error 事件不再清除 retrying 状态
      // retrying 状态由专用事件控制
      return { ...prev, running: false }

    case 'usage_update':
      return {
        ...prev,
        inputTokens: event.usage.inputTokens,
        ...(event.usage.contextWindow && { contextWindow: event.usage.contextWindow }),
      }

    case 'compacting':
      return { ...prev, isCompacting: true }

    case 'compact_complete':
      return { ...prev, isCompacting: false }

    case 'model_resolved':
      return { ...prev, model: event.model }

    case 'retrying':
      // 向后兼容：保留原有的简单 retrying 事件
      return {
        ...prev,
        retrying: prev.retrying ?? {
          currentAttempt: event.attempt,
          maxAttempts: event.maxAttempts,
          history: [],
          failed: false,
        },
      }

    case 'retry_attempt': {
      // 新增：记录详细的重试尝试
      const currentHistory = prev.retrying?.history ?? []
      return {
        ...prev,
        retrying: {
          currentAttempt: event.attemptData.attempt,
          maxAttempts: prev.retrying?.maxAttempts ?? 3,
          history: [...currentHistory, event.attemptData],
          failed: false,
        },
      }
    }

    case 'retry_cleared':
      // 新增：重试成功，清除状态
      return { ...prev, retrying: undefined }

    case 'retry_failed': {
      // 新增：重试失败，标记为 failed 但保留历史
      const finalHistory = prev.retrying?.history ?? []
      return {
        ...prev,
        running: false,
        retrying: {
          currentAttempt: event.finalAttempt.attempt,
          maxAttempts: prev.retrying?.maxAttempts ?? 3,
          history: [...finalHistory, event.finalAttempt],
          failed: true,
        },
      }
    }

    case 'permission_request':
      // 权限请求事件由 PermissionBanner 处理，不影响流式状态
      return prev

    case 'permission_resolved':
      // 权限解决事件由 PermissionBanner 处理，不影响流式状态
      return prev

    case 'ask_user_request':
      // AskUser 请求事件由 AskUserBanner 处理，不影响流式状态
      return prev

    case 'ask_user_resolved':
      // AskUser 解决事件由 AskUserBanner 处理，不影响流式状态
      return prev

    case 'prompt_suggestion':
      // 提示建议由全局监听器处理，不影响流式状态
      return prev

    default:
      return prev
  }
}

/**
 * Agent 流式错误消息 Map — 以 sessionId 为 key
 * 错误发生时写入，下次发送或手动关闭时清除
 */
export const agentStreamErrorsAtom = atom<Map<string, string>>(new Map())

/**
 * Agent 消息刷新版本 Map — 以 sessionId 为 key
 * 全局监听器在流式完成/错误时递增版本号，
 * AgentView 监听版本号变化来重新加载消息。
 */
export const agentMessageRefreshAtom = atom<Map<string, number>>(new Map())

/**
 * Agent 会话输入框草稿 Map — 以 sessionId 为 key
 * 用于在切换会话时保留输入框内容
 */
export const agentSessionDraftsAtom = atom<Map<string, string>>(new Map())
