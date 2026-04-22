/**
 * AgentOrchestrator — Agent 编排层
 *
 * 从 agent-service.ts 提取的核心业务逻辑，负责：
 * - 并发守卫（同一会话不允许并行请求）
 * - 渠道查找 + API Key 解密
 * - 环境变量构建 + SDK 路径解析
 * - 用户/助手消息持久化
 * - 事件流遍历 + 文本累积 + 事件持久化
 * - 错误处理 + 部分内容保存
 * - 自动标题生成
 *
 * 通过 EventBus 分发 AgentEvent，通过 SessionCallbacks 发送控制信号，
 * 完全解耦 Electron IPC，可独立测试（mock Adapter + EventBus）。
 */

import { randomUUID } from 'node:crypto'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import type {
  AgentSendInput,
  AgentEvent,
  AgentMessage,
  AgentGenerateTitleInput,
  AgentMcpServerConfig,
  AgentProviderAdapter,
  TypedError,
  RetryAttempt,
} from '@proma/shared'
import { SAFE_TOOLS } from '@proma/shared'
import type { PermissionRequest, PromaPermissionMode, AskUserRequest } from '@proma/shared'
import type { HookCallbackMatcher, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk'
import type { ClaudeAgentQueryOptions } from './adapters/claude-agent-adapter'
import { isPromptTooLongError } from './adapters/claude-agent-adapter'
import { AgentEventBus } from './agent-event-bus'
import { appendAgentMessage, updateAgentSessionMeta, getAgentSessionMeta, getAgentSessionMessages } from './agent-session-manager'
import { deleteAgentSessionAttachments } from './agent-attachment-service'
import {
  getAgentSessionWorkspacePath,
  getAgentWorkspacePath,
  getSdkConfigDir,
  getWorkspaceMemoryFilePath,
  getWorkspaceFilesDir,
} from './config-paths'
import { getRuntimeStatus } from './runtime-init'
import { getSettings } from './settings-service'
import { getEffectiveProxyUrl } from './proxy-settings-service'
import { buildSystemPromptAppend, buildDynamicContext } from './agent-prompt-builder'
import { permissionService } from './agent-permission-service'
import { askUserService } from './agent-ask-user-service'
import { mapAgentFriendlyError } from './agent-friendly-error'
import { applyPromaAgentToolGuardrails } from './agent-tool-guardrails'
import {
  areAllWorkersIdle,
  findTeamLeadInboxPath,
  formatInboxPrompt,
  formatSummaryFallbackPrompt,
  INBOX_RETRY_CONFIG,
  markInboxAsRead,
  pollInboxWithRetry,
  type TaskNotificationSummary,
} from './agent-team-reader'
import {
  ensureDefaultWorkspace,
  getAgentWorkspace,
  getWorkspaceAttachedDirectories,
  getWorkspaceSkillInvocationName,
  getWorkspaceMcpConfig,
  readWorkspaceSkillBootstrap,
} from './workspace-service'
import {
  isPageBuilderDockerRuntime,
  isDefaultPageBuilderPlaywrightEntry,
  resolvePageBuilderInternalPreviewUrl,
  resolvePageBuilderPlaywrightMcpUrl,
} from './page-builder-runtime-playwright'
import { getWorkspacePreviewState } from './workspace-preview-service'
import { resolvePageBuilderCmsConfig } from './page-builder-cms-config'
import { CmsGateway } from './cms-gateway'
import {
  buildCmsRuntimeToolBundle,
  CMS_RUNTIME_SERVER_NAME,
  type CmsRuntimeToolBundle,
} from './cms-sdk-tools'
import {
  capturePageBuilderAgentHtmlSnapshot,
  finalizePageBuilderAgentHtmlGuardrails,
  type PageBuilderAgentHtmlSnapshot,
} from './page-builder-agent-html-guardrails-service'
import {
  buildSidecarSummary,
  getDiagnosticBackendLogger,
  getDiagnosticLoggingRuntimeState,
  serializeDiagnosticText,
  serializeDiagnosticError,
  type AgentSendDiagnosticContext,
} from './diagnostic-logging'
import { writeTurnDiagnosticSidecar } from './diagnostic-sidecar-writer'

type AgentMcpServerMap = Record<string, AgentMcpServerConfig>

interface ResolvedWorkspaceRuntime {
  workspace: import('@proma/shared').AgentWorkspace
  agentCwd: string
  pluginPath: string
  additionalDirectories: string[]
  mcpServers: AgentMcpServerMap
}

function buildWorkspaceMcpServers(workspace: import('@proma/shared').AgentWorkspace): AgentMcpServerMap {
  const mcpServers: AgentMcpServerMap = {}
  const mcpConfig = getWorkspaceMcpConfig(workspace.slug)
  const dockerRuntime = workspace.template === 'page-builder'
    ? isPageBuilderDockerRuntime()
    : false
  const dockerPlaywrightMcpUrl = workspace.template === 'page-builder'
    ? resolvePageBuilderPlaywrightMcpUrl()
    : null

  for (const [name, entry] of Object.entries(mcpConfig.servers ?? {})) {
    if (!entry.enabled) continue

    if (
      workspace.template === 'page-builder'
      && name === 'playwright'
      && dockerRuntime
      && !dockerPlaywrightMcpUrl
      && isDefaultPageBuilderPlaywrightEntry(entry)
    ) {
      continue
    }

    if (
      workspace.template === 'page-builder'
      && name === 'playwright'
      && dockerPlaywrightMcpUrl
      && isDefaultPageBuilderPlaywrightEntry(entry)
    ) {
      mcpServers[name] = {
        type: 'http',
        url: dockerPlaywrightMcpUrl,
        required: false,
      }
      continue
    }

    if (entry.type === 'stdio' && entry.command) {
      const mergedEnv: Record<string, string> = {
        ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
        ...(entry.env ?? {}),
      }
      mcpServers[name] = {
        type: 'stdio',
        command: entry.command,
        ...(entry.args && entry.args.length > 0 && { args: entry.args }),
        ...(Object.keys(mergedEnv).length > 0 && { env: mergedEnv }),
        required: false,
        startup_timeout_sec: entry.timeout ?? 30,
      }
      continue
    }

    if ((entry.type === 'http' || entry.type === 'sse') && entry.url) {
      mcpServers[name] = {
        type: entry.type,
        url: entry.url,
        ...(entry.headers && Object.keys(entry.headers).length > 0 && { headers: entry.headers }),
        required: false,
      }
    }
  }

  return mcpServers
}

function buildBootstrappedSkillsPrompt(workspaceSlug: string, skillSlugs: readonly string[]): string | null {
  const bootstrappedSkills = Array.from(new Set(skillSlugs))
    .map((skillSlug) => ({
      skillSlug,
      bootstrap: readWorkspaceSkillBootstrap(workspaceSlug, skillSlug),
    }))
    .filter((entry): entry is { skillSlug: string; bootstrap: { invocationName: string; content: string } } => (
      entry.bootstrap !== null
    ))

  if (bootstrappedSkills.length === 0) {
    return null
  }

  return `<bootstrapped_skills>
宿主已为本次 turn 预加载以下 Skill。即使没有显式 Skill tool 记录，也必须遵守这些控制边界；显式 Skill 调用仅用于透明度和审计。
${bootstrappedSkills.map(({ skillSlug, bootstrap }) => [
  '',
  `## ${skillSlug}`,
  `Invocation: ${bootstrap.invocationName}`,
  bootstrap.content,
].join('\n')).join('\n')}
</bootstrapped_skills>`
}

function pickMcpServersByName(
  servers: AgentMcpServerMap,
  names: readonly string[],
): AgentMcpServerMap {
  const selected: AgentMcpServerMap = {}

  for (const name of names) {
    const server = servers[name]
    if (server) {
      selected[name] = server
    }
  }

  return selected
}

function buildWorkspaceMcpStateLines(servers: AgentMcpServerMap): string[] {
  return Object.entries(servers).map(([name, server]) => {
    const entry = server as Record<string, unknown>
    const type = typeof entry.type === 'string' ? entry.type : 'unknown'
    let detail = ''

    if (type === 'stdio' && typeof entry.command === 'string') {
      const args = Array.isArray(entry.args)
        ? entry.args.filter((arg): arg is string => typeof arg === 'string')
        : []
      detail = `${entry.command}${args.length > 0 ? ` ${args.join(' ')}` : ''}`
    } else if ((type === 'http' || type === 'sse') && typeof entry.url === 'string') {
      detail = entry.url
    } else if (type === 'sdk' && typeof entry.name === 'string') {
      detail = entry.name
    }

    return detail.length > 0
      ? `- ${name} (${type}, 已启用): ${detail}`
      : `- ${name} (${type}, 已启用)`
  })
}

function resolveCmsRuntimeToolBundle(
  workspace: import('@proma/shared').AgentWorkspace,
  sessionId: string,
): CmsRuntimeToolBundle | null {
  if (workspace.template !== 'page-builder') {
    return null
  }

  const cmsConfig = resolvePageBuilderCmsConfig()
  if (!cmsConfig) {
    return null
  }

  const gateway = new CmsGateway({
    config: cmsConfig,
  })

  return buildCmsRuntimeToolBundle(gateway, {
    workspace,
    sessionId,
  })
}

export function resolveWorkspaceRuntimeContext(
  sessionId: string,
  overrides?: Pick<AgentSendInput, 'workspaceId' | 'additionalDirectories'>,
): ResolvedWorkspaceRuntime {
  const sessionMeta = getAgentSessionMeta(sessionId)
  const fallbackWorkspace = ensureDefaultWorkspace()
  const resolvedWorkspaceId = overrides?.workspaceId ?? sessionMeta?.workspaceId ?? fallbackWorkspace.id
  const workspace = getAgentWorkspace(resolvedWorkspaceId) ?? fallbackWorkspace
  const agentCwd = getAgentSessionWorkspacePath(workspace.slug, sessionId)
  const mergedDirectories = [...(overrides?.additionalDirectories ?? [])]

  for (const directory of getWorkspaceAttachedDirectories(workspace.slug)) {
    if (!mergedDirectories.includes(directory)) {
      mergedDirectories.push(directory)
    }
  }

  const workspaceFilesDir = getWorkspaceFilesDir(workspace.slug)
  if (!mergedDirectories.includes(workspaceFilesDir)) {
    mergedDirectories.push(workspaceFilesDir)
  }

  return {
    workspace,
    agentCwd,
    pluginPath: getAgentWorkspacePath(workspace.slug),
    additionalDirectories: mergedDirectories,
    mcpServers: buildWorkspaceMcpServers(workspace),
  }
}

// ===== 类型定义 =====

/**
 * 会话控制信号回调
 *
 * 解耦 Electron webContents，使 Orchestrator 可独立测试。
 * agent-service.ts 负责将这些回调绑定到 webContents.send()。
 */
export interface SessionCallbacks {
  /** 发送流式错误 */
  onError: (error: string) => void
  /** 发送流式完成（携带已持久化的消息列表） */
  onComplete: (messages?: AgentMessage[]) => void
  /** 发送标题更新 */
  onTitleUpdated: (title: string) => void
}

// ===== 工具函数 =====

/**
 * 从 stderr 中提取 API 错误信息
 *
 * 解析类似这样的错误：
 * "401 {\"error\":{\"message\":\"...\"}}"
 * "API error: 400 Bad Request ..."
 */
function extractApiError(stderr: string): { statusCode: number; message: string } | null {
  if (!stderr) return null

  // 模式 1：JSON 错误格式 - "401 {...}"
  const jsonMatch = stderr.match(/(\d{3})\s+(\{[^}]*"error"[^}]*\})/s)
  if (jsonMatch) {
    try {
      const statusCode = parseInt(jsonMatch[1]!)
      const errorObj = JSON.parse(jsonMatch[2]!)
      const message = errorObj.error?.message || errorObj.message || '未知错误'
      return { statusCode, message }
    } catch {
      // JSON 解析失败，继续尝试其他模式
    }
  }

  // 模式 2：API error 格式 - "API error (attempt X/Y): 401 401 {...}"
  const apiErrorMatch = stderr.match(/API error[^:]*:\s+(\d{3})\s+\d{3}\s+(\{.*?\})/s)
  if (apiErrorMatch) {
    try {
      const statusCode = parseInt(apiErrorMatch[1]!)
      const errorObj = JSON.parse(apiErrorMatch[2]!)
      const message = errorObj.error?.message || errorObj.message || '未知错误'
      return { statusCode, message }
    } catch {
      // JSON 解析失败
    }
  }

  // 模式 3：直接的状态码 + 消息
  const simpleMatch = stderr.match(/(\d{3})[:\s]+(.+?)(?:\n|$)/i)
  if (simpleMatch) {
    const statusCode = parseInt(simpleMatch[1]!)
    const message = simpleMatch[2]!.trim()
    if (statusCode >= 400 && statusCode < 600) {
      return { statusCode, message }
    }
  }

  return null
}

function logAgentLifecycle(
  level: 'info' | 'warn' | 'error',
  payload: Record<string, unknown>,
): void {
  const diagnosticLogger = getDiagnosticBackendLogger({
    component: 'agent_orchestrator',
    category: 'turn_trace',
    requestId: payload.requestId ?? null,
    turnId: payload.turnId ?? null,
    sessionId: payload.sessionId ?? null,
    workspaceId: payload.workspaceId ?? null,
  })
  if (level === 'info') {
    diagnosticLogger.info(payload, 'Agent 编排执行生命周期')
  } else if (level === 'warn') {
    diagnosticLogger.warn(payload, 'Agent 编排执行生命周期')
  } else {
    diagnosticLogger.error(payload, 'Agent 编排执行生命周期')
  }

  const consoleLogger = level === 'info' ? console.info : level === 'warn' ? console.warn : console.error
  consoleLogger('[AgentOrchestrator]', payload)
}

function truncateDiagnostic(text: string, maxLength = 8_000): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}\n\n...[truncated ${text.length - maxLength} chars]`
}

function buildCatchErrorDetails(params: {
  apiError: { statusCode: number; message: string } | null
  rawErrorMessage: string
  stderrOutput: string
  userFacingError: string
}): string[] | undefined {
  const details: string[] = []

  if (params.apiError) {
    details.push(`HTTP ${params.apiError.statusCode}: ${params.apiError.message}`)
  } else if (params.rawErrorMessage && params.rawErrorMessage !== params.userFacingError) {
    details.push(`运行时错误: ${params.rawErrorMessage}`)
  }

  const stderrFirstLine = params.stderrOutput
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)
  if (stderrFirstLine && !details.some((detail) => detail.includes(stderrFirstLine))) {
    details.push(`SDK stderr: ${stderrFirstLine}`)
  }

  return details.length > 0 ? details : undefined
}

function buildCatchOriginalError(params: {
  apiError: { statusCode: number; message: string } | null
  error: unknown
  stderrOutput: string
}): string | undefined {
  const sections: string[] = []

  if (params.apiError) {
    sections.push(`API Error ${params.apiError.statusCode}: ${params.apiError.message}`)
  }

  if (params.error instanceof Error) {
    sections.push(params.error.stack ?? params.error.message)
  } else if (params.error !== undefined && params.error !== null) {
    sections.push(String(params.error))
  }

  if (params.stderrOutput) {
    sections.push(`stderr:\n${params.stderrOutput}`)
  }

  const combined = sections
    .map((section) => section.trim())
    .filter(Boolean)
    .join('\n\n')

  return combined ? truncateDiagnostic(combined) : undefined
}

function normalizeAnthropicBaseUrlForSdk(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v\d+\/messages$/, '')
    .replace(/\/v\d+$/, '')
}

async function withSdkConfigDir<T>(
  sdkConfigDir: string | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  if (!sdkConfigDir) {
    return operation()
  }

  const previousSdkConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = sdkConfigDir

  try {
    return await operation()
  } finally {
    if (previousSdkConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = previousSdkConfigDir
    }
  }
}

// ===== 自动重试工具函数 =====

/** 可自动重试的 TypedError 错误码 */
const AUTO_RETRYABLE_ERROR_CODES: ReadonlySet<string> = new Set([
  'rate_limited',
  'provider_error',      // overloaded 映射为 provider_error
  'service_error',
  'service_unavailable',
  'network_error',
])

/** 判断 typed_error 事件是否可自动重试 */
function isAutoRetryableTypedError(error: TypedError): boolean {
  return AUTO_RETRYABLE_ERROR_CODES.has(error.code)
}

/** 判断 catch 块中的 API 错误是否可自动重试（HTTP 429 / 5xx / 已知可恢复错误模式） */
function isAutoRetryableCatchError(
  apiError: { statusCode: number; message: string } | null,
  rawErrorMessage?: string,
): boolean {
  if (apiError) {
    if (apiError.statusCode === 429 || apiError.statusCode >= 500) return true
  }
  // 已知的可恢复错误模式（无 HTTP 状态码但可重试）
  if (rawErrorMessage) {
    if (rawErrorMessage.includes('context_management')) return true
  }
  return false
}

/** 最大自动重试次数 */
const MAX_AUTO_RETRIES = 3

/** 计算重试延迟（指数退避：1s, 2s, 4s） */
function getRetryDelayMs(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt - 1), 8000)
}

/**
 * 可中断的定时器
 *
 * 等待指定毫秒，如果 signal 被中止则立即 resolve。
 */
function timerWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) { resolve(); return }
    const tid = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => { clearTimeout(tid); resolve() }, { once: true })
  })
}

/**
 * 解析 SDK cli.js 路径
 *
 * SDK 作为 esbuild external 依赖，require.resolve 可在运行时解析实际路径。
 * 多种策略降级：createRequire → 全局 require → node_modules 手动查找
 *
 * 打包环境下：asar 内的路径需要转换为 asar.unpacked 路径，
 * 因为子进程 (bun) 无法读取 asar 归档内的文件。
 */
function resolveSDKCliPath(): string {
  let cliPath: string | null = null

  // 策略 1：createRequire（标准 ESM/CJS 互操作）
  try {
    const cjsRequire = createRequire(import.meta.url)
    const sdkEntryPath = cjsRequire.resolve('@anthropic-ai/claude-agent-sdk')
    cliPath = join(dirname(sdkEntryPath), 'cli.js')
    console.log(`[Agent 编排] SDK CLI 路径 (createRequire): ${cliPath}`)
  } catch (e) {
    console.warn('[Agent 编排] createRequire 解析 SDK 路径失败:', e)
  }

  // 策略 2：从项目根目录手动查找
  if (!cliPath) {
    cliPath = join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js')
    console.log(`[Agent 编排] SDK CLI 路径 (手动): ${cliPath}`)
  }

  return cliPath
}

/**
 * 获取 Agent SDK 运行时可执行文件
 *
 * 优先级：Node.js → Bun → which node 同步查找 → 字符串 'node'
 *
 * 当 runtimeStatusCache 尚未初始化时（应用启动竞态），
 * 降级到 'node' 字符串可能因 Electron 进程 PATH 不含 node 而触发 ENOENT。
 * 此时用 which/where 同步查找作为兜底，避免 SDK spawn 失败。
 */
function getAgentExecutable(): { type: 'node' | 'bun'; path: string } {
  const status = getRuntimeStatus()

  if (status?.node?.available && status.node.path) {
    return { type: 'node', path: status.node.path }
  }

  if (status?.bun?.available && status.bun.path) {
    return { type: 'bun', path: status.bun.path }
  }

  // runtimeStatusCache 未就绪时，同步查找 node 路径
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    const nodePath = execFileSync(cmd, ['node'], { encoding: 'utf-8', timeout: 2000 })
      .trim()
      .split('\n')[0]
    if (nodePath && existsSync(nodePath)) {
      console.warn(`[Agent 编排] runtimeStatusCache 未就绪，同步查找 node: ${nodePath}`)
      return { type: 'node', path: nodePath }
    }
  } catch {
    // 忽略查找失败，继续降级
  }

  return { type: 'node', path: 'node' }
}

/**
 * 确保打包环境下 ripgrep 可被 SDK CLI 找到
 *
 * 通过 symlink 桥接 extraResources → SDK 的 vendor 目录。
 */
function ensureRipgrepAvailable(cliPath: string): void {
  void cliPath
}

/** 最大回填消息条数 */
const MAX_CONTEXT_MESSAGES = 20

/** 单条工具摘要最大字符数 */
const MAX_TOOL_SUMMARY_LENGTH = 200

/**
 * 从 assistant 消息的 events 中提取工具活动摘要
 *
 * 返回简要的工具名称 + 关键输入信息，帮助新 SDK 会话理解之前做过什么。
 */
function extractToolSummary(events: import('@proma/shared').AgentEvent[]): string {
  const summaries: string[] = []
  for (const event of events) {
    if (event.type === 'tool_start') {
      const input = event.input
      // 提取关键输入参数（如 file_path、command 等）
      const keyParam = input.file_path ?? input.command ?? input.path ?? input.query ?? ''
      const paramStr = keyParam ? `: ${String(keyParam).slice(0, 100)}` : ''
      summaries.push(`[tool: ${event.toolName}${paramStr}]`)
    }
  }
  if (summaries.length === 0) return ''
  const joined = summaries.join(' ')
  return joined.length > MAX_TOOL_SUMMARY_LENGTH
    ? joined.slice(0, MAX_TOOL_SUMMARY_LENGTH) + '...'
    : joined
}

function buildAttachedFilesPrompt(
  attachments: AgentMessage['attachments'] | AgentSendInput['attachments'],
  agentCwd: string,
): string {
  if (!attachments || attachments.length === 0) {
    return ''
  }

  const lines = attachments.map((attachment) => (
    `- ${attachment.filename}: ${join(agentCwd, attachment.localPath)}`
  ))

  return `<attached_files>\n${lines.join('\n')}\n</attached_files>`
}

function buildPromptMessageContent(
  content: string,
  attachments: AgentMessage['attachments'] | AgentSendInput['attachments'],
  agentCwd: string,
): string {
  const attachmentPrompt = buildAttachedFilesPrompt(attachments, agentCwd)
  if (!attachmentPrompt) {
    return content
  }

  return content
    ? `${content}\n\n${attachmentPrompt}`
    : attachmentPrompt
}

/**
 * 构建带历史上下文的 prompt
 *
 * 当 resume 不可用时，将最近消息拼接为上下文注入 prompt，
 * 让新 SDK 会话保留对话记忆。包含文本内容和工具活动摘要。
 */
function buildContextPrompt(sessionId: string, currentUserMessage: string, agentCwd: string): string {
  const allMessages = getAgentSessionMessages(sessionId)
  if (allMessages.length === 0) return currentUserMessage

  const history = allMessages.slice(0, -1)
  if (history.length === 0) return currentUserMessage

  const recent = history.slice(-MAX_CONTEXT_MESSAGES)
  const lines = recent
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && (m.content || m.attachments?.length))
    .map((m) => {
      const promptContent = buildPromptMessageContent(m.content, m.attachments, agentCwd)
      let line = `[${m.role}]: ${promptContent}`
      // assistant 消息附带工具活动摘要，减少迁移后的"失忆"感
      if (m.role === 'assistant' && m.events && m.events.length > 0) {
        const toolSummary = extractToolSummary(m.events)
        if (toolSummary) {
          line += `\n  工具活动: ${toolSummary}`
        }
      }
      return line
    })

  if (lines.length === 0) return currentUserMessage

  return `<conversation_history>\n${lines.join('\n')}\n</conversation_history>\n\n${currentUserMessage}`
}

/** 标题最大长度 */
const MAX_TITLE_LENGTH = 20

/** 默认会话标题（用于判断是否需要自动生成） */
const DEFAULT_SESSION_TITLE = '新 Agent 会话'

/** 默认模型 ID */
const DEFAULT_MODEL_ID = 'claude-sonnet-4-5-20250929'

// ===== AgentOrchestrator =====

export class AgentOrchestrator {
  private adapter: AgentProviderAdapter
  private eventBus: AgentEventBus
  private activeSessions = new Set<string>()

  constructor(adapter: AgentProviderAdapter, eventBus: AgentEventBus) {
    this.adapter = adapter
    this.eventBus = eventBus
  }

  /**
   * 构建 SDK 环境变量
   *
   * 注入 API Key、Base URL、代理、Shell 配置等。
   */
  private async buildSdkEnv(
    apiKey: string,
    baseUrl: string | undefined,
  ): Promise<Record<string, string | undefined>> {
    const DEFAULT_ANTHROPIC_URL = 'https://api.anthropic.com'

    // 从 process.env 继承系统变量，但清理所有 ANTHROPIC_ 前缀的变量，
    // 防止本地开发环境（如 ANTHROPIC_AUTH_TOKEN、ANTHROPIC_API_KEY、
    // ANTHROPIC_BASE_URL 等）干扰 SDK 的认证和请求目标。
    // 即使 index.ts 启动时已清理过一次，initializeRuntime() 中的
    // loadShellEnv() 可能从 shell 配置文件（~/.zshrc 等）重新注入这些变量。
    const cleanEnv: Record<string, string | undefined> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith('ANTHROPIC_')) {
        cleanEnv[key] = value
      }
    }

    const sdkEnv: Record<string, string | undefined> = {
      ...cleanEnv,
      ANTHROPIC_API_KEY: apiKey,
      // 提升输出 token 上限，避免 "exceeded 32000 output token maximum" 错误
      CLAUDE_CODE_MAX_OUTPUT_TOKENS: '64000',
      // 启用 Agent Teams（实验性多 Agent 协作）
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
      // 启用 Tasks 功能
      CLAUDE_CODE_ENABLE_TASKS: 'true',
      // 配置隔离：让 SDK 使用独立的配置目录，不读取用户的 ~/.claude.json
      CLAUDE_CONFIG_DIR: getSdkConfigDir(),
    }

    // 显式控制 ANTHROPIC_BASE_URL：仅在用户配置了自定义 Base URL 时注入
    // 使用统一的 normalizeAnthropicBaseUrlForSdk 规范化，SDK 内部会自动拼接 /v1/messages
    if (baseUrl && baseUrl !== DEFAULT_ANTHROPIC_URL) {
      sdkEnv.ANTHROPIC_BASE_URL = normalizeAnthropicBaseUrlForSdk(baseUrl)
    }

    const proxyUrl = await getEffectiveProxyUrl()
    if (proxyUrl) {
      sdkEnv.HTTPS_PROXY = proxyUrl
      sdkEnv.HTTP_PROXY = proxyUrl
    }

    // Windows 平台：配置 Shell 环境
    if (process.platform === 'win32') {
      const runtimeStatus = getRuntimeStatus()
      const shellStatus = runtimeStatus?.shell

      if (shellStatus) {
        if (shellStatus.gitBash?.available && shellStatus.gitBash.path) {
          sdkEnv.CLAUDE_CODE_SHELL = shellStatus.gitBash.path
          console.log(`[Agent 编排] 配置 Shell 环境: Git Bash (${shellStatus.gitBash.path})`)
        } else if (shellStatus.wsl?.available) {
          sdkEnv.CLAUDE_CODE_SHELL = 'wsl'
          console.log(`[Agent 编排] 配置 Shell 环境: WSL ${shellStatus.wsl.version} (${shellStatus.wsl.defaultDistro})`)
        } else {
          console.warn('[Agent 编排] Windows 平台未检测到可用的 Shell 环境（Git Bash / WSL）')
        }
        sdkEnv.CLAUDE_BASH_NO_LOGIN = '1'
      }
    }

    return sdkEnv
  }

  /**
   * 生成 Agent 会话标题
   *
   * 简化实现：直接从首条用户消息裁剪标题，避免额外 Provider 调用。
   */
  async generateTitle(input: AgentGenerateTitleInput): Promise<string | null> {
    const normalized = input.userMessage
      .replace(/\s+/g, ' ')
      .replace(/^["'""''「《]+|["'""''」》]+$/g, '')
      .trim()
    if (!normalized) return null

    const title = normalized.slice(0, MAX_TITLE_LENGTH)
    console.log('[Agent 标题生成] 使用首条消息生成标题:', { title })
    return title
  }

  /**
   * 流完成后自动生成标题
   *
   * 如果会话标题仍为默认值，自动调用标题生成并通过回调通知。
   */
  private async autoGenerateTitle(
    sessionId: string,
    userMessage: string,
    callbacks: SessionCallbacks,
  ): Promise<void> {
    try {
      const meta = getAgentSessionMeta(sessionId)
      if (!meta || meta.title !== DEFAULT_SESSION_TITLE) return

      const title = await this.generateTitle({
        userMessage,
        channelId: '',
        modelId: '',
      })
      if (!title) return

      updateAgentSessionMeta(sessionId, { title })
      callbacks.onTitleUpdated(title)
      console.log(`[Agent 编排] 自动标题生成完成: "${title}"`)
    } catch (error) {
      console.warn('[Agent 编排] 自动标题生成失败:', error)
    }
  }

  /**
   * 持久化助手消息（累积的文本 + 事件）
   */
  private persistAssistantMessage(
    sessionId: string,
    accumulatedText: string,
    accumulatedEvents: AgentEvent[],
    resolvedModel: string,
  ): void {
    if (!accumulatedText && accumulatedEvents.length === 0) return

    const assistantMsg: AgentMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: accumulatedText,
      createdAt: Date.now(),
      model: resolvedModel,
      events: accumulatedEvents,
    }
    appendAgentMessage(sessionId, assistantMsg)
  }

  /**
   * 发送消息并流式推送事件
   *
   * 核心编排方法，从 agent-service.ts 的 runAgent 提取。
   * 通过 EventBus 分发 AgentEvent，通过 callbacks 发送控制信号。
   */
  async sendMessage(
    input: AgentSendInput,
    callbacks: SessionCallbacks,
    diagnostic?: AgentSendDiagnosticContext,
  ): Promise<void> {
    const {
      sessionId,
      userMessage,
      composedUserMessage,
      workspaceId,
      additionalDirectories,
      customMcpServers,
      mentionedSkills,
      bootstrappedSkills,
      mentionedMcpServers,
      attachments,
    } = input
    const stderrChunks: string[] = []
    const workspaceRuntime = resolveWorkspaceRuntimeContext(sessionId, {
      workspaceId,
      additionalDirectories,
    })
    const workspaceSlug = workspaceRuntime.workspace.slug
    const isPageBuilderWorkspace = workspaceRuntime.workspace.template === 'page-builder'
    const priorMessages = getAgentSessionMessages(sessionId)
    const turnMessageStartIndex = priorMessages.length
    const isFirstUserTurn = !priorMessages.some((message) => message.role === 'user')
    const cmsRuntimeToolBundle = resolveCmsRuntimeToolBundle(workspaceRuntime.workspace, sessionId)
    const availableWorkspaceMcpServers: AgentMcpServerMap = {
      ...workspaceRuntime.mcpServers,
      ...(cmsRuntimeToolBundle ? {
        [CMS_RUNTIME_SERVER_NAME]: cmsRuntimeToolBundle.mcpServer,
      } : {}),
    }
    const rollbackPendingAttachments = () => {
      if (!attachments || attachments.length === 0) {
        return
      }

      deleteAgentSessionAttachments({
        sessionId,
        workspaceId: workspaceRuntime.workspace.id,
        attachments,
      })
    }
    const requestId = diagnostic?.requestTrace?.requestId ?? null
    const turnId = diagnostic?.turnTrace?.turnId ?? null
    const diagnosticRuntime = getDiagnosticLoggingRuntimeState()
    const logTurnPhase = (
      level: 'info' | 'warn' | 'error',
      phase: string,
      payload: Record<string, unknown> = {},
      message = 'Agent send 处理链路',
    ) => {
      const eventPayload = {
        phase,
        requestId,
        turnId,
        sessionId,
        workspaceId: workspaceRuntime.workspace.id,
        ...payload,
      }

      const diagnosticLogger = getDiagnosticBackendLogger({
        component: 'agent_orchestrator',
        category: 'turn_trace',
        requestId,
        turnId,
        sessionId,
        workspaceId: workspaceRuntime.workspace.id,
      })

      if (level === 'info') {
        diagnosticLogger.info(eventPayload, message)
      } else if (level === 'warn') {
        diagnosticLogger.warn(eventPayload, message)
      } else {
        diagnosticLogger.error(eventPayload, message)
      }
    }
    const writeTurnTextSidecar = (
      baseName: string,
      extension: string,
      content: string | null | undefined,
    ): string[] => {
      if (!turnId || !content) {
        return []
      }

      try {
        const result = writeTurnDiagnosticSidecar({
          turnsDir: diagnosticRuntime.turnsDir,
          turnId,
          baseName,
          extension,
          content,
          maxFileSizeBytes: diagnosticRuntime.maxFileSizeBytes,
        })
        logTurnPhase('info', 'sidecar_written', {
          sidecarType: baseName,
          contentLength: content.length,
          ...buildSidecarSummary(result.relativePaths),
        }, 'Agent turn sidecar written')
        return result.relativePaths
      } catch (error) {
        logTurnPhase('warn', 'sidecar_write_failed', {
          sidecarType: baseName,
          error: serializeDiagnosticError(error),
        }, 'Agent turn sidecar write failed')
        return []
      }
    }
    const writeTurnStructuredSidecar = (
      baseName: string,
      value: unknown,
    ): string[] => writeTurnTextSidecar(baseName, '.txt', serializeDiagnosticText(value))
    let conversationMessagesSidecarPaths: string[] = []
    const buildCurrentTurnConversationMessagesPayload = (): {
      scope: 'current_turn_messages'
      omittedHistoryMessageCount: number
      currentTurnMessageCount: number
      messages: AgentMessage[]
    } => {
      const currentTurnMessages = getAgentSessionMessages(sessionId).slice(turnMessageStartIndex)

      return {
        scope: 'current_turn_messages',
        omittedHistoryMessageCount: turnMessageStartIndex,
        currentTurnMessageCount: currentTurnMessages.length,
        messages: currentTurnMessages,
      }
    }
    const refreshConversationMessagesSidecar = (): void => {
      conversationMessagesSidecarPaths = writeTurnStructuredSidecar(
        'conversation-messages',
        buildCurrentTurnConversationMessagesPayload(),
      )
    }
    const appendTurnConversationMessage = (message: AgentMessage): void => {
      appendAgentMessage(sessionId, message)
      refreshConversationMessagesSidecar()
    }
    const requestPayloadSidecarPaths = diagnostic?.structuredRequestPayload
      ? writeTurnStructuredSidecar('request-payload', diagnostic.structuredRequestPayload)
      : []
    const userMessageSidecarPaths = writeTurnTextSidecar('user-message', '.txt', userMessage)
    const composedUserMessageSidecarPaths = composedUserMessage
      ? writeTurnTextSidecar('composed-user-message', '.txt', composedUserMessage)
      : []

    logTurnPhase('info', 'request_received', {
      hasStructuredRequestPayload: Boolean(diagnostic?.structuredRequestPayload),
      requestContentType: diagnostic?.structuredRequestPayload?.contentType ?? null,
      userMessageLength: userMessage.length,
      hasComposedUserMessage: Boolean(composedUserMessage),
      attachmentCount: attachments?.length ?? 0,
      mentionedSkills: mentionedSkills ?? [],
      mentionedMcpServers: mentionedMcpServers ?? [],
      ...buildSidecarSummary(requestPayloadSidecarPaths),
    }, 'Agent turn request received')

    // 0. 并发保护
    if (this.activeSessions.has(sessionId)) {
      logTurnPhase('warn', 'reject_busy', {
        workspaceId: workspaceId ?? workspaceRuntime.workspace.id,
      }, 'Agent turn rejected because session is busy')
      console.warn(`[Agent 编排] 会话 ${sessionId} 正在处理中，拒绝新请求`)
      callbacks.onError('上一条消息仍在处理中，请稍候再试')
      return
    }

    // 1. Windows 平台：检查 Shell 环境可用性
    if (process.platform === 'win32') {
      const runtimeStatus = getRuntimeStatus()
      const shellStatus = runtimeStatus?.shell

      if (shellStatus && !shellStatus.gitBash?.available && !shellStatus.wsl?.available) {
        const errorMsg = `Windows 平台需要 Git Bash 或 WSL 环境才能运行 Agent。

当前状态：
- Git Bash: ${shellStatus.gitBash?.error || '未检测到'}
- WSL: ${shellStatus.wsl?.error || '未检测到'}

解决方案：
1. 安装 Git for Windows（推荐）: https://git-scm.com/download/win
2. 或启用 WSL: https://learn.microsoft.com/zh-cn/windows/wsl/install

安装完成后请重启应用。`

        rollbackPendingAttachments()
        logTurnPhase('error', 'runtime_shell_missing', {
          platform: process.platform,
          shellStatus,
        }, 'Agent runtime shell requirement missing')
        callbacks.onError(errorMsg)
        return
      }
    }

    // 2. 直接从环境变量读取 API Key（不再依赖渠道系统）
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
    if (!apiKey) {
      rollbackPendingAttachments()
      logTurnPhase('error', 'api_key_missing', {}, '缺少 Agent API Key')
      callbacks.onError('未检测到 ANTHROPIC_API_KEY 环境变量，请先在终端配置后再发送消息')
      return
    }
    const baseUrl = process.env.ANTHROPIC_BASE_URL?.trim()

    // 3. 构建环境变量
    // 同步凭证到 process.env（SDK in-process 代码可能直接读取 process.env）
    // 先清理再注入，确保 SDK 无论从 env 选项还是 process.env 都拿到正确值
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_AUTH_TOKEN
    delete process.env.ANTHROPIC_BASE_URL
    process.env.ANTHROPIC_API_KEY = apiKey
    // 使用与 buildSdkEnv 相同的规范化逻辑，确保 process.env 和 sdkEnv 中的 URL 一致
    if (baseUrl && baseUrl !== 'https://api.anthropic.com') {
      process.env.ANTHROPIC_BASE_URL = normalizeAnthropicBaseUrlForSdk(baseUrl)
    }

    let sdkEnv: Record<string, string | undefined>
    let sdk: typeof import('@anthropic-ai/claude-agent-sdk')
    try {
      sdkEnv = await this.buildSdkEnv(apiKey, baseUrl)
      sdk = await import('@anthropic-ai/claude-agent-sdk')
    } catch (error) {
      rollbackPendingAttachments()
      logTurnPhase('error', 'sdk_bootstrap_failed', {
        error: serializeDiagnosticError(error),
      }, 'Agent SDK bootstrap failed')
      throw error
    }

    // 4. 读取已有的 SDK session ID（用于 resume）
    const sessionMeta = getAgentSessionMeta(sessionId)
    let existingSdkSessionId = sessionMeta?.sdkSessionId
    console.log(`[Agent 编排] 会话 resume 状态: sdkSessionId=${existingSdkSessionId || '无'}`)

    const cliPath = resolveSDKCliPath()
    const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null'

    // 5. 预检 SDK CLI 和运行时，再持久化用户消息
    const agentExec = getAgentExecutable()

    if (!existsSync(cliPath)) {
      const errMsg = `SDK CLI 文件不存在: ${cliPath}`
      console.error(`[Agent 编排] ${errMsg}`)
      rollbackPendingAttachments()
      logTurnPhase('error', 'sdk_cli_missing', {
        cliPath,
      }, 'Agent SDK CLI missing')
      callbacks.onError(errMsg)
      return
    }

    ensureRipgrepAvailable(cliPath)

    console.log(
      `[Agent 编排] 启动 SDK — CLI: ${cliPath}, 运行时: ${agentExec.type} (${agentExec.path}), resume: ${existingSdkSessionId ?? '无'}`,
    )

    const userMsg: AgentMessage = {
      id: randomUUID(),
      role: 'user',
      content: userMessage,
      createdAt: Date.now(),
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    }
    const pageBuilderAgentHtmlSnapshot: PageBuilderAgentHtmlSnapshot | null = isPageBuilderWorkspace
      ? capturePageBuilderAgentHtmlSnapshot(workspaceRuntime.workspace)
      : null
    try {
      appendTurnConversationMessage(userMsg)
    } catch (error) {
      rollbackPendingAttachments()
      logTurnPhase('error', 'user_message_persist_failed', {
        error: serializeDiagnosticError(error),
      }, 'Agent user message persistence failed')
      throw error
    }
    logTurnPhase('info', 'user_message_persisted', {
      messageId: userMsg.id,
      hasAttachments: Boolean(attachments?.length),
      attachmentCount: attachments?.length ?? 0,
      userMessageSidecarPaths,
      composedUserMessageSidecarPaths,
      conversationMessagesSidecarPaths,
    }, 'Agent user message persisted')

    // 6. 注册活跃会话
    this.activeSessions.add(sessionId)
    logAgentLifecycle('info', {
      phase: 'active_session_add',
      requestId,
      turnId,
      sessionId,
      workspaceId: workspaceRuntime.workspace.id,
      activeCount: this.activeSessions.size,
    })

    // 7. 状态初始化
    let accumulatedText = ''
    const accumulatedEvents: AgentEvent[] = []
    let resolvedModel = DEFAULT_MODEL_ID
    const persistAssistantMessageForTurn = (
      text: string,
      events: AgentEvent[],
    ): void => {
      this.persistAssistantMessage(sessionId, text, events, resolvedModel)
      refreshConversationMessagesSidecar()
    }
    let agentCwd = workspaceRuntime.agentCwd
    let pluginPath = workspaceRuntime.pluginPath
    let resolvedAdditionalDirectories: string[] = [...workspaceRuntime.additionalDirectories]
    const suppressedDefaultPageBuilderMcp = isPageBuilderWorkspace && isFirstUserTurn
    let resolvedMcpServers: AgentMcpServerMap = suppressedDefaultPageBuilderMcp
      ? {
          ...pickMcpServersByName(availableWorkspaceMcpServers, mentionedMcpServers ?? []),
          ...(cmsRuntimeToolBundle ? {
            [CMS_RUNTIME_SERVER_NAME]: cmsRuntimeToolBundle.mcpServer,
          } : {}),
        }
      : { ...availableWorkspaceMcpServers }

    try {
      // 8. 构建 SDK query
      const executableArgs = agentExec.type === 'bun' ? [`--env-file=${nullDevice}`] : []

      if (suppressedDefaultPageBuilderMcp) {
        console.log(
          `[Agent 编排] page-builder 首轮消息延后挂载默认 MCP（显式提及: ${mentionedMcpServers?.join(', ') || '无'}；宿主 CMS runtime: ${cmsRuntimeToolBundle ? '保留' : '无'}）`,
        )
      }

      if (customMcpServers) {
        Object.assign(resolvedMcpServers, customMcpServers)
      }

      if (existingSdkSessionId) {
        console.log(`[Agent 编排] 将尝试 resume: ${existingSdkSessionId}`)
      } else {
        console.log(`[Agent 编排] 无 sdkSessionId，将作为新会话启动（回填历史上下文）`)
      }

      // 9.5 验证 sdkSessionId 是否仍然有效（SDK 0.2.53 listSessions）
      if (existingSdkSessionId) {
        try {
          const listSessions = (sdk as unknown as {
            listSessions: (opts: { dir: string }) => Promise<Array<{ sessionId: string }>>
          }).listSessions
          const sessions = await withSdkConfigDir(sdkEnv.CLAUDE_CONFIG_DIR, () => listSessions({ dir: agentCwd }))
          const isValid = sessions.some((s: { sessionId: string }) => s.sessionId === existingSdkSessionId)
          if (!isValid) {
            console.log(`[Agent 编排] sdkSessionId 已失效 (${existingSdkSessionId})，将使用上下文注入`)
            existingSdkSessionId = undefined
            updateAgentSessionMeta(sessionId, { sdkSessionId: undefined })
          }
        } catch {
          // 验证失败不阻塞主流程
          console.warn(`[Agent 编排] listSessions 验证失败，继续使用现有 sessionId`)
        }
      }

      // 10. 构建动态上下文和最终 prompt
      const runtimePlaywright = isPageBuilderWorkspace
        ? resolvedMcpServers.playwright
        : undefined
      const configuredRuntimePlaywrightUrl = isPageBuilderWorkspace
        ? resolvePageBuilderPlaywrightMcpUrl()
        : null
      const runtimePlaywrightUrl = (() => {
        if (!runtimePlaywright || typeof runtimePlaywright !== 'object') {
          return null
        }

        const candidate = runtimePlaywright as Record<string, unknown>
        return candidate.type === 'http' && typeof candidate.url === 'string'
          ? candidate.url
          : null
      })()
      const hasRuntimePageBuilderPlaywright = Boolean(
        configuredRuntimePlaywrightUrl
        && runtimePlaywrightUrl === configuredRuntimePlaywrightUrl,
      )

      const runtimePlaywrightPreviewUrl = (() => {
        if (!isPageBuilderWorkspace) return undefined

        if (!hasRuntimePageBuilderPlaywright) {
          return undefined
        }

        const previewState = getWorkspacePreviewState(workspaceRuntime.workspace)
        return resolvePageBuilderInternalPreviewUrl(previewState.entryUrl)
          ?? undefined
      })()

      const dynamicCtx = buildDynamicContext({
        agentCwd,
        workspaceName: workspaceRuntime.workspace.name,
        workspaceSlug,
        workspaceRootPath: getAgentWorkspacePath(workspaceSlug),
        workspaceFilesDir: getWorkspaceFilesDir(workspaceSlug),
        accessibleDirectories: resolvedAdditionalDirectories,
        memoryFilePath: getWorkspaceMemoryFilePath(workspaceSlug),
        workspaceMcpStateLines: buildWorkspaceMcpStateLines(resolvedMcpServers),
        pageBuilderRuntimePlaywrightActive: hasRuntimePageBuilderPlaywright,
        pageBuilderInternalPreviewUrl: runtimePlaywrightPreviewUrl,
      })
      logTurnPhase('info', 'dynamic_context_built', {
        dynamicContextLength: dynamicCtx.length,
        additionalDirectoryCount: resolvedAdditionalDirectories.length,
        mcpServerNames: Object.keys(resolvedMcpServers),
        hasRuntimePageBuilderPlaywright,
        runtimePlaywrightPreviewUrl: runtimePlaywrightPreviewUrl ?? null,
      }, 'Agent dynamic context built')

      const runtimeUserMessage = composedUserMessage ?? userMessage
      const availableMentionedMcpServers = (mentionedMcpServers ?? [])
        .filter((name) => Object.prototype.hasOwnProperty.call(resolvedMcpServers, name))
      const bootstrappedSkillSet = new Set((bootstrappedSkills ?? []).filter(Boolean))
      let enrichedMessage = runtimeUserMessage
      const bootstrappedSkillsPrompt = workspaceSlug && bootstrappedSkills?.length
        ? buildBootstrappedSkillsPrompt(workspaceSlug, bootstrappedSkills)
        : null
      if (bootstrappedSkillsPrompt) {
        enrichedMessage = `${bootstrappedSkillsPrompt}\n\n${enrichedMessage}`
        console.log(`[Agent 编排] 注入 bootstrapped_skills: ${bootstrappedSkills?.length ?? 0} skills`)
      }
      if (mentionedSkills?.length || availableMentionedMcpServers.length > 0) {
        const toolLines: string[] = ['用户在消息中明确引用了以下工具，请在本次回复中主动调用：']

        for (const slug of mentionedSkills ?? []) {
          if (bootstrappedSkillSet.has(slug)) {
            continue
          }
          const qualifiedName = workspaceSlug
            ? getWorkspaceSkillInvocationName(workspaceSlug, slug)
            : slug
          toolLines.push(`- Skill: ${qualifiedName}（请立即调用此 Skill）`)
        }

        for (const name of availableMentionedMcpServers) {
          toolLines.push(`- MCP 服务器: ${name}（请使用此 MCP 服务器的工具来完成任务）`)
        }

        if (toolLines.length > 1) {
          enrichedMessage = `<mentioned_tools>\n${toolLines.join('\n')}\n</mentioned_tools>\n\n${enrichedMessage}`
          console.log(`[Agent 编排] 注入 mentioned_tools: ${mentionedSkills?.length ?? 0} skills, ${availableMentionedMcpServers.length} MCP`)
        }
      }

      enrichedMessage = buildPromptMessageContent(enrichedMessage, attachments, agentCwd)

      const contextualMessage = `${dynamicCtx}\n\n${enrichedMessage}`

      const isCompactCommand = userMessage.trim() === '/compact'
      const finalPrompt = isCompactCommand
        ? '/compact'
        : existingSdkSessionId
          ? contextualMessage
          : buildContextPrompt(sessionId, contextualMessage, agentCwd)

      if (existingSdkSessionId) {
        console.log(`[Agent 编排] 使用 resume 模式，SDK session ID: ${existingSdkSessionId}`)
      } else if (finalPrompt !== contextualMessage) {
        console.log(`[Agent 编排] 无 resume，已回填历史上下文（最近 ${MAX_CONTEXT_MESSAGES} 条消息）`)
      }

      // 12. 读取应用设置 + 获取权限模式
      const appSettings = getSettings()
      const permissionMode: PromaPermissionMode = appSettings.agentPermissionMode ?? 'smart'
      const keepsAskUserInteractive = isPageBuilderWorkspace
      const bypassPermissions = permissionMode === 'auto' && !keepsAskUserInteractive
      const promptPermissionMode: PromaPermissionMode = bypassPermissions ? permissionMode : 'smart'
      console.log(`[Agent 编排] 权限模式: ${permissionMode}${isPageBuilderWorkspace ? ' (page-builder 工作区策略已接管)' : ''}`)

      const systemPromptAppend = buildSystemPromptAppend({
        sessionId,
        permissionMode: promptPermissionMode,
        workspaceName: workspaceRuntime.workspace.name,
        workspaceSlug,
      })
      const finalPromptSidecarPaths = writeTurnTextSidecar('final-prompt', '.txt', finalPrompt)
      const systemPromptSidecarPaths = writeTurnTextSidecar('system-prompt', '.txt', systemPromptAppend)
      logTurnPhase('info', 'prompt_built', {
        finalPromptLength: finalPrompt.length,
        contextualMessageLength: contextualMessage.length,
        systemPromptLength: systemPromptAppend.length,
        isCompactCommand,
        usedResumeSessionId: existingSdkSessionId ?? null,
        finalPromptSidecarPaths,
        systemPromptSidecarPaths,
      }, 'Agent prompt built')

      const baseCanUseTool = !bypassPermissions
        ? permissionService.createCanUseTool(
            sessionId,
            permissionMode,
            (request: PermissionRequest) => {
              const event: AgentEvent = { type: 'permission_request', request }
              this.eventBus.emit(sessionId, event)
            },
            (sid, toolInput, signal, sendAskUser, notifyResolved) =>
              askUserService.handleAskUserQuestion(sid, toolInput, signal, sendAskUser, notifyResolved),
            (request: AskUserRequest) => {
              const event: AgentEvent = { type: 'ask_user_request', request }
              this.eventBus.emit(sessionId, event)
            },
            (requestId, behavior) => {
              this.eventBus.emit(sessionId, { type: 'permission_resolved', requestId, behavior })
            },
            (requestId) => {
              this.eventBus.emit(sessionId, { type: 'ask_user_resolved', requestId })
            },
            {
              autoAllowAllNonAskUser: keepsAskUserInteractive,
            },
          )
        : undefined

      const canUseTool = baseCanUseTool
        ? async (
            toolName: string,
            toolInput: Record<string, unknown>,
            options: Parameters<typeof baseCanUseTool>[2],
          ) => {
            const guarded = applyPromaAgentToolGuardrails(toolName, toolInput, {
              runtimeMode: 'scratch',
            })

            if (guarded.changed) {
              console.log(`[Agent 编排] Agent tool guardrail 已改写输入: ${guarded.reason}`)
            }

            // Scratch workspace 下的 Agent tool 属于运行时编排能力本身。
            // 这里直接放行，可避免多 subagent 工作流被权限弹窗打断，同时保证
            // `worktree` 等不受支持的输入已经先经过 guardrail 降级。
            if (toolName === 'Agent') {
              return {
                behavior: 'allow' as const,
                updatedInput: guarded.updatedInput,
              }
            }

            return baseCanUseTool(toolName, guarded.updatedInput, options)
          }
        : undefined

      const hooks: { PreToolUse: HookCallbackMatcher[] } | undefined = workspaceSlug
        ? {
            PreToolUse: [{
              hooks: [
                async (input) => {
                  const hookInput = input as PreToolUseHookInput

                  if (hookInput.tool_name !== 'Agent') {
                    return { continue: true }
                  }

                  const toolInput = (
                    hookInput.tool_input &&
                    typeof hookInput.tool_input === 'object' &&
                    !Array.isArray(hookInput.tool_input)
                  )
                    ? hookInput.tool_input as Record<string, unknown>
                    : {}

                  const guarded = applyPromaAgentToolGuardrails(hookInput.tool_name, toolInput, {
                    runtimeMode: 'scratch',
                  })

                  if (guarded.changed) {
                    console.log(`[Agent 编排] PreToolUse hook 已改写 Agent 输入: ${guarded.reason}`)
                  }

                  return {
                    continue: true,
                    hookSpecificOutput: {
                      hookEventName: 'PreToolUse' as const,
                      permissionDecision: 'allow' as const,
                      updatedInput: guarded.updatedInput,
                      permissionDecisionReason: 'Scratch workspace subagents run without worktree isolation',
                    },
                  }
                },
              ],
            }],
          }
        : undefined

      // 13. 构建 Adapter 查询选项
      const maxTurns = appSettings.agentMaxTurns && appSettings.agentMaxTurns > 0
        ? appSettings.agentMaxTurns
        : undefined
      const runtimeAllowedTools = cmsRuntimeToolBundle
        && Object.prototype.hasOwnProperty.call(resolvedMcpServers, CMS_RUNTIME_SERVER_NAME)
        ? cmsRuntimeToolBundle.allowedTools
        : []
      const allowedTools = !bypassPermissions && permissionMode !== 'auto'
        ? Array.from(new Set([
            ...SAFE_TOOLS,
            ...runtimeAllowedTools,
          ]))
        : undefined
      const queryOptions: ClaudeAgentQueryOptions = {
        sessionId,
        prompt: finalPrompt,
        cwd: agentCwd,
        sdkCliPath: cliPath,
        executable: agentExec,
        executableArgs,
        env: sdkEnv,
        ...(maxTurns != null && { maxTurns }),
        sdkPermissionMode: bypassPermissions ? 'bypassPermissions' : 'default',
        // 仅在 auto/bypass 模式下才显式跳过权限。
        // 交互模式必须保留 canUseTool 链路，否则 scratch subagent guardrail 无法生效。
        allowDangerouslySkipPermissions: bypassPermissions,
        ...(canUseTool && { canUseTool }),
        ...(hooks && { hooks }),
        ...(allowedTools && { allowedTools }),
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: systemPromptAppend,
        },
        resumeSessionId: existingSdkSessionId,
        ...(resolvedAdditionalDirectories.length > 0 && { additionalDirectories: resolvedAdditionalDirectories }),
        ...(Object.keys(resolvedMcpServers).length > 0 && { mcpServers: resolvedMcpServers }),
        ...(pluginPath && { plugins: [{ type: 'local' as const, path: pluginPath }] }),
        // SDK 0.2.52+ 新增选项（从 settings 读取）
        ...(appSettings.agentThinking && { thinking: appSettings.agentThinking }),
        ...(appSettings.agentEffort && { effort: appSettings.agentEffort }),
        ...(appSettings.agentMaxBudgetUsd != null && appSettings.agentMaxBudgetUsd > 0 && {
          maxBudgetUsd: appSettings.agentMaxBudgetUsd,
        }),
        onStderr: (data: string) => {
          stderrChunks.push(data)
          logTurnPhase('warn', 'sdk_stderr_chunk', {
            chunkLength: data.length,
            stderrChunkPreview: truncateDiagnostic(data, 1_000),
          }, 'Agent SDK stderr chunk received')
          console.error(`[Agent SDK stderr] ${data}`)
        },
        onSessionId: (sdkSessionId: string) => {
          capturedSdkSessionId = sdkSessionId
          if (sdkSessionId === persistedSdkSessionId) {
            return
          }

          try {
            updateAgentSessionMeta(sessionId, { sdkSessionId })
            existingSdkSessionId = sdkSessionId
            persistedSdkSessionId = sdkSessionId
            queryOptions.resumeSessionId = sdkSessionId
            if (!isCompactCommand) {
              queryOptions.prompt = contextualMessage
            }
            logTurnPhase('info', 'sdk_session_resolved', {
              sdkSessionId,
              resumeMode: Boolean(existingSdkSessionId),
            }, 'Agent SDK session resolved')
            console.log(`[Agent 编排] 已保存 SDK session_id: ${sdkSessionId}`)
          } catch {
            // 索引更新失败不影响主流程
          }
        },
        onModelResolved: (model: string) => {
          resolvedModel = model
          logTurnPhase('info', 'sdk_model_resolved', {
            resolvedModel: model,
          }, 'Agent SDK model resolved')
          console.log(`[Agent 编排] SDK 确认模型: ${resolvedModel}`)
          // 通知渲染进程更新流式状态中的模型信息
          const modelEvent: AgentEvent = { type: 'model_resolved', model }
          this.eventBus.emit(sessionId, modelEvent)
        },
        onContextWindow: (cw: number) => {
          logTurnPhase('info', 'sdk_context_window', {
            contextWindow: cw,
          }, 'Agent SDK context window updated')
          console.log(`[Agent 编排] 缓存 contextWindow: ${cw}`)
        },
      }

      logTurnPhase('info', 'sdk_query_started', {
        cwd: agentCwd,
        sdkCliPath: cliPath,
        executableType: agentExec.type,
        executablePath: agentExec.path,
        hasResumeSessionId: Boolean(existingSdkSessionId),
        additionalDirectoryCount: resolvedAdditionalDirectories.length,
        mcpServerNames: Object.keys(resolvedMcpServers),
        allowedToolCount: allowedTools?.length ?? 0,
        permissionMode,
        bypassPermissions,
      }, 'Agent SDK query started')
      console.log(`[Agent 编排] 开始通过 Adapter 遍历事件流...`)

      // 14. 遍历 Adapter 产出的 AgentEvent 流（含自动重试 + Watchdog 死锁检测）
      let lastRetryableError: string | undefined
      let retrySucceeded = false

      // Agent Teams 追踪
      const startedTaskIds = new Set<string>()
      const completedTaskIds = new Set<string>()
      const taskNotificationSummaries: TaskNotificationSummary[] = []
      /** 捕获到的 SDK session ID（用于 auto-resume 的 inbox 查找） */
      let capturedSdkSessionId = existingSdkSessionId
      /** 已落盘的 SDK session ID（用于去重写入/日志） */
      let persistedSdkSessionId = existingSdkSessionId
      /** Watchdog 触发标记（死锁被检测到时设为 true） */
      let abortedByWatchdog = false
      /** 已尝试的上下文压缩恢复次数（每条用户消息最多一次） */
      let attemptedCompactRecovery = false
      /** 自动 compact 后跳过 retry 退避/提示 */
      let skipRetryDelayOnce = false

      const attemptCompactRecovery = async (
        source: 'typed_error' | 'catch',
      ): Promise<'recovered' | 'failed' | 'aborted'> => {
        if (attemptedCompactRecovery) {
          return 'failed'
        }

        const resumeSessionId = capturedSdkSessionId ?? existingSdkSessionId
        if (!resumeSessionId) {
          logTurnPhase('warn', 'compact_recovery_unavailable', {
            source,
          }, 'Agent compact recovery unavailable')
          console.warn(`[Agent 编排] ${source} 路径检测到上下文过长，但当前无可恢复的 sdkSessionId`)
          return 'failed'
        }

        attemptedCompactRecovery = true
        stderrChunks.length = 0
        logTurnPhase('warn', 'compact_recovery_started', {
          source,
          resumeSessionId,
        }, 'Agent compact recovery started')
        console.log(`[Agent 编排] ${source} 路径检测到上下文过长，尝试自动执行 /compact (resume=${resumeSessionId})`)

        try {
          let compactCompleted = false
          let sawCompacting = false
          let sawCompactComplete = false

          for await (const event of this.adapter.query({
            ...queryOptions,
            prompt: '/compact',
            resumeSessionId,
            // /compact 不需要工具，避免在嵌套 query 中重复连接 runtime SDK MCP transport。
            mcpServers: undefined,
          } as ClaudeAgentQueryOptions)) {
            if (!this.activeSessions.has(sessionId)) {
              if (sawCompacting && !sawCompactComplete) {
                this.eventBus.emit(sessionId, { type: 'compact_complete' })
              }
              logTurnPhase('warn', 'turn_aborted', {
                abortStage: 'compact_recovery',
              }, 'Agent turn aborted during compact recovery')
              console.log(`[Agent 编排] 自动 /compact 期间会话 ${sessionId} 已被用户中止`)
              return 'aborted'
            }

            if (event.type === 'typed_error') {
              if (sawCompacting && !sawCompactComplete) {
                this.eventBus.emit(sessionId, { type: 'compact_complete' })
              }
              writeTurnStructuredSidecar('compact-typed-error', event.error)
              logTurnPhase('error', 'compact_recovery_typed_error', {
                errorCode: event.error.code,
                errorTitle: event.error.title,
              }, 'Agent compact recovery typed error')
              console.error(`[Agent 编排] 自动 /compact 返回 typed_error: ${event.error.code} - ${event.error.message}`)
              return 'failed'
            }

            if (event.type === 'error') {
              if (sawCompacting && !sawCompactComplete) {
                this.eventBus.emit(sessionId, { type: 'compact_complete' })
              }
              writeTurnStructuredSidecar('compact-error', event)
              logTurnPhase('error', 'compact_recovery_error', {
                message: event.message,
              }, 'Agent compact recovery error')
              console.error(`[Agent 编排] 自动 /compact 返回 error: ${event.message}`)
              return 'failed'
            }

            if (event.type === 'compacting' || event.type === 'compact_complete' || event.type === 'status_notice') {
              if (event.type === 'compacting') {
                sawCompacting = true
              } else if (event.type === 'compact_complete') {
                sawCompactComplete = true
              }
              this.eventBus.emit(sessionId, event)
            }

            if (event.type === 'complete') {
              compactCompleted = true
            }
          }

          if (!compactCompleted) {
            if (sawCompacting && !sawCompactComplete) {
              this.eventBus.emit(sessionId, { type: 'compact_complete' })
            }
            console.error('[Agent 编排] 自动 /compact 未收到 complete 事件')
            return 'failed'
          }

          existingSdkSessionId = resumeSessionId
          capturedSdkSessionId = resumeSessionId
          queryOptions.resumeSessionId = resumeSessionId
          if (!isCompactCommand) {
            queryOptions.prompt = contextualMessage
          }
          stderrChunks.length = 0
          logTurnPhase('info', 'compact_recovery_succeeded', {
            source,
            resumeSessionId,
          }, 'Agent compact recovery succeeded')
          console.log('[Agent 编排] 自动 /compact 成功，准备重放原始用户消息')
          return 'recovered'
        } catch (compactError) {
          this.eventBus.emit(sessionId, { type: 'compact_complete' })
          logTurnPhase('error', 'compact_recovery_failed', {
            source,
            error: serializeDiagnosticError(compactError),
          }, 'Agent compact recovery failed')
          console.error('[Agent 编排] 自动 /compact 失败:', compactError)
          return this.activeSessions.has(sessionId) ? 'failed' : 'aborted'
        }
      }

      for (let attempt = 1; attempt <= MAX_AUTO_RETRIES + 1; attempt++) {
        // 非首次尝试：等待 + 发送重试事件到 UI
        if (attempt > 1) {
          if (skipRetryDelayOnce) {
            skipRetryDelayOnce = false
          } else {
            const delayMs = getRetryDelayMs(attempt - 1)
            const delaySec = delayMs / 1000
            const attemptData: RetryAttempt = {
              attempt: attempt - 1,
              timestamp: Date.now(),
              reason: lastRetryableError ?? '未知错误',
              errorMessage: lastRetryableError ?? '',
              delaySeconds: delaySec,
            }

            this.eventBus.emit(sessionId, {
              type: 'retrying',
              attempt: attempt - 1,
              maxAttempts: MAX_AUTO_RETRIES,
              delaySeconds: delaySec,
              reason: lastRetryableError ?? '未知错误',
            })
            this.eventBus.emit(sessionId, { type: 'retry_attempt', attemptData })
            logTurnPhase('warn', 'retry_scheduled', {
              attempt: attempt - 1,
              delaySeconds: delaySec,
              reason: lastRetryableError ?? '未知错误',
            }, 'Agent retry scheduled')

            console.log(`[Agent 编排] 第 ${attempt - 1} 次重试，等待 ${delaySec}s...`)
            await new Promise((r) => setTimeout(r, delayMs))

            // 等待期间如果会话被中止，退出
            if (!this.activeSessions.has(sessionId)) {
              persistAssistantMessageForTurn(accumulatedText, accumulatedEvents)
              logTurnPhase('warn', 'turn_aborted', {
                abortStage: 'retry_wait',
              }, 'Agent turn aborted during retry wait')
              callbacks.onComplete(getAgentSessionMessages(sessionId))
              return
            }
          }
        }

        let shouldRetryFromTypedError = false

        try {
          // 获取异步迭代器（手动 .next() 以支持 Promise.race 中断）
          const queryIterable = this.adapter.query(queryOptions)
          const queryIterator = queryIterable[Symbol.asyncIterator]()

          // Watchdog 控制器（用于死锁检测后中断事件循环）
          const loopAbort = new AbortController()
          abortedByWatchdog = false

          // 启动 Watchdog（每 5 秒检查是否所有 Worker 已 idle 但 Task 工具仍在等待）
          const WATCHDOG_INTERVAL_MS = 5_000
          const watchdogDone = (async () => {
            while (!loopAbort.signal.aborted) {
              await timerWithAbort(WATCHDOG_INTERVAL_MS, loopAbort.signal)
              if (loopAbort.signal.aborted) break

              // 仅在有 Worker 启动且未全部完成时检查
              if (
                startedTaskIds.size > 0 &&
                completedTaskIds.size < startedTaskIds.size &&
                capturedSdkSessionId
              ) {
                const allIdle = await areAllWorkersIdle(capturedSdkSessionId, startedTaskIds.size)
                if (allIdle) {
                  console.log(
                    `[Agent 编排] Watchdog: 所有 ${startedTaskIds.size} 个 Worker 已 idle，` +
                    `Task 工具仍在等待 — 中断以触发 auto-resume`,
                  )
                  abortedByWatchdog = true
                  loopAbort.abort()
                  break
                }
              }
            }
          })()

          // 手动事件循环：Promise.race（事件 vs Watchdog 中断）
          let pendingNext: Promise<IteratorResult<AgentEvent>> | null = null
          // Teams 活跃时延迟 complete 事件，避免前端提前标记 teammates 为 stopped
          let deferredCompleteEvent: AgentEvent | null = null
          let firstEventReceived = false

          while (!loopAbort.signal.aborted) {
            if (!pendingNext) {
              pendingNext = queryIterator.next()
            }

            const abortPromise = new Promise<null>((resolve) => {
              if (loopAbort.signal.aborted) { resolve(null); return }
              loopAbort.signal.addEventListener('abort', () => resolve(null), { once: true })
            })

            const raceResult = await Promise.race([
              pendingNext.then((r) => ({ kind: 'event' as const, result: r })),
              abortPromise.then(() => ({ kind: 'abort' as const, result: null })),
            ])

            if (raceResult.kind === 'abort') {
              // Watchdog 触发：终止事件循环，但不中止 SDK 会话
              // 注意：pending .next() 可能因 SDK 阻塞而永远不返回，
              // 因此 .return() 也会排队挂起 — 不能 await，用超时保护
              pendingNext?.catch(() => {})  // 防止未处理 rejection
              pendingNext = null
              const returnPromise = queryIterator.return?.(undefined as never).catch(() => {})
              // 最多等 1 秒，超时则放弃（generator 稍后 GC 清理）
              await Promise.race([
                returnPromise,
                new Promise<void>((r) => setTimeout(r, 1000)),
              ])
              console.log(`[Agent 编排] Watchdog 中断：已退出事件循环`)
              break
            }

            const iterResult = raceResult.result
            if (!iterResult || iterResult.done) break

            pendingNext = null
            const event = iterResult.value
            if (!firstEventReceived) {
              firstEventReceived = true
              logTurnPhase('info', 'first_event_received', {
                eventType: event.type,
                attempt,
              }, 'Agent first stream event received')
            }

            // typed_error：判断是否可自动重试
            if (event.type === 'typed_error') {
              const typedErrorSidecarPaths = writeTurnStructuredSidecar('typed-error', event.error)
              const shouldAttemptCompactRecovery = event.error.code === 'prompt_too_long'
                || isPromptTooLongError(event.error.message, event.error.originalError ?? '')

              if (shouldAttemptCompactRecovery) {
                persistAssistantMessageForTurn(accumulatedText, accumulatedEvents)
                accumulatedText = ''
                accumulatedEvents.length = 0

                const compactRecoveryResult = await attemptCompactRecovery('typed_error')
                if (compactRecoveryResult === 'aborted') {
                  if (!loopAbort.signal.aborted) loopAbort.abort()
                  await watchdogDone
                  callbacks.onComplete(getAgentSessionMessages(sessionId))
                  return
                }
                if (compactRecoveryResult === 'recovered') {
                  shouldRetryFromTypedError = true
                  skipRetryDelayOnce = attempt > 1
                  attempt -= 1
                  break
                }
              }

              if (isAutoRetryableTypedError(event.error) && attempt <= MAX_AUTO_RETRIES) {
                lastRetryableError = event.error.title
                  ? `${event.error.title}: ${event.error.message}`
                  : event.error.message
                logTurnPhase('warn', 'typed_error_retry_scheduled', {
                  errorCode: event.error.code,
                  errorTitle: event.error.title,
                  typedErrorSidecarPaths,
                  reason: lastRetryableError,
                }, 'Agent retry scheduled from typed error')
                console.log(`[Agent 编排] 可重试错误 (typed_error): ${event.error.code} - ${lastRetryableError}`)
                // 保存部分内容后准备重试
                persistAssistantMessageForTurn(accumulatedText, accumulatedEvents)
                accumulatedText = ''
                accumulatedEvents.length = 0
                shouldRetryFromTypedError = true
                break  // 跳出事件循环，进入下一次 retry 循环
              }

              // 不可重试 → 走原有终止逻辑
              persistAssistantMessageForTurn(accumulatedText, accumulatedEvents)

              const errorMsg: AgentMessage = {
                id: randomUUID(),
                role: 'status',
                content: event.error.title
                  ? `${event.error.title}: ${event.error.message}`
                  : event.error.message,
                createdAt: Date.now(),
                errorCode: event.error.code,
                errorTitle: event.error.title,
                errorDetails: event.error.details,
                errorOriginal: event.error.originalError,
                errorCanRetry: event.error.canRetry,
                errorActions: event.error.actions,
              }
              appendTurnConversationMessage(errorMsg)
              logAgentLifecycle('error', {
                phase: 'typed_error_persisted',
                requestId,
                turnId,
                sessionId,
                workspaceId: workspaceRuntime.workspace.id,
                errorCode: event.error.code,
                errorTitle: event.error.title,
                canRetry: event.error.canRetry,
                detailsCount: event.error.details?.length ?? 0,
                hasOriginalError: Boolean(event.error.originalError),
                typedErrorSidecarPaths,
              })
              console.log(`[Agent 编排] 已保存 TypedError 消息: ${event.error.code} - ${event.error.title}`)

              // 如果之前有重试记录，发送 retry_failed
              if (attempt > 1 && lastRetryableError) {
                this.eventBus.emit(sessionId, {
                  type: 'retry_failed',
                  finalAttempt: {
                    attempt: attempt - 1,
                    timestamp: Date.now(),
                    reason: lastRetryableError,
                    errorMessage: event.error.message,
                    delaySeconds: 0,
                  },
                })
              }

              this.eventBus.emit(sessionId, event)
              // 清理 Watchdog
              if (!loopAbort.signal.aborted) loopAbort.abort()
              await watchdogDone
              try { updateAgentSessionMeta(sessionId, {}) } catch { /* 忽略 */ }
              logTurnPhase('error', 'turn_failed', {
                failureSource: 'typed_error',
                errorCode: event.error.code,
              }, 'Agent turn failed with typed error')
              callbacks.onComplete(getAgentSessionMessages(sessionId))
              return
            }

            // 正常事件处理
            if (event.type === 'text_delta') {
              accumulatedText += event.text
            }
            accumulatedEvents.push(event)

            // Agent Teams: 当有 teammate 活跃时，延迟 complete 事件
            // 避免前端收到 complete → 标记所有 teammates 为 stopped → 建议不渲染
            if (event.type === 'complete' && startedTaskIds.size > 0) {
              console.log(`[Agent 编排] 延迟 complete 事件（${startedTaskIds.size} 个 teammate 活跃）`)
              deferredCompleteEvent = event
              // 不发射到 eventBus，继续等待 auto-resume
            } else {
              this.eventBus.emit(sessionId, event)
            }

            // Agent Teams: 追踪 teammate 任务状态
            if (event.type === 'task_started') {
              startedTaskIds.add(event.taskId)
            } else if (event.type === 'task_notification') {
              completedTaskIds.add(event.taskId)
              if (event.summary) {
                taskNotificationSummaries.push({
                  taskId: event.taskId,
                  status: event.status,
                  summary: event.summary,
                  outputFile: event.outputFile,
                })
              }
            }
          }

          // 清理 Watchdog（事件循环正常结束或被 Watchdog 中断）
          if (!loopAbort.signal.aborted) loopAbort.abort()
          await watchdogDone

          if (abortedByWatchdog) {
            logTurnPhase('warn', 'watchdog_aborted_stream_loop', {
              startedTaskCount: startedTaskIds.size,
            }, 'Agent watchdog aborted stream loop')
            console.log(`[Agent 编排] Watchdog 中断了事件循环，将触发 auto-resume`)
          }

          // typed_error break 触发了 → 继续循环
          if (shouldRetryFromTypedError) {
            continue
          }

          // 正常完成 — 如果之前有重试，发送 retry_cleared
          if (attempt > 1) {
            this.eventBus.emit(sessionId, { type: 'retry_cleared' })
            logTurnPhase('info', 'retry_cleared', {
              recoveredAttempt: attempt,
            }, 'Agent retry state cleared after success')
            console.log(`[Agent 编排] 重试成功，已在第 ${attempt} 次尝试后恢复`)
          }
          retrySucceeded = true

          // 15. 持久化 assistant 消息
          persistAssistantMessageForTurn(accumulatedText, accumulatedEvents)
          const successStderrOutput = stderrChunks.join('').trim()
          const successStderrSidecarPaths = successStderrOutput
            ? writeTurnTextSidecar('stderr', '.log', successStderrOutput)
            : []
          logTurnPhase('info', 'assistant_message_persisted', {
            assistantTextLength: accumulatedText.length,
            assistantEventCount: accumulatedEvents.length,
            resolvedModel,
            conversationMessagesSidecarPaths,
            successStderrSidecarPaths,
          }, 'Agent assistant message persisted')

          // 16. Agent Teams Auto-Resume：teammates 完成后自动收集结果并汇总
          //     触发条件：有 teammate 启动过（正常完成或 Watchdog 中断均适用）
          console.log(`[Agent 编排] Auto-resume 条件检查: startedTasks=${startedTaskIds.size}, sdkSession=${!!capturedSdkSessionId}, active=${this.activeSessions.has(sessionId)}`)
          if (startedTaskIds.size > 0 && capturedSdkSessionId && this.activeSessions.has(sessionId)) {
            logTurnPhase('info', 'auto_resume_started', {
              startedTaskCount: startedTaskIds.size,
              sdkSessionId: capturedSdkSessionId,
            }, 'Agent auto-resume started')
            console.log(`[Agent 编排] Agent Teams 检测到 ${startedTaskIds.size} 个 teammate，启动 auto-resume`)

            // 通知前端：正在收集 teammate 结果
            this.eventBus.emit(sessionId, {
              type: 'waiting_resume',
              message: '正在收集 teammate 工作结果...',
            })

            // 构造 resume prompt（优先 inbox，fallback 到 summaries）
            let resumePrompt: string | null = null

            const inboxInfo = await findTeamLeadInboxPath(capturedSdkSessionId)
            console.log(`[Agent 编排] Inbox 查找结果: ${inboxInfo ? `team=${inboxInfo.teamName}` : '未找到 team'}`)
            if (inboxInfo) {
              const unreadMessages = await pollInboxWithRetry(
                inboxInfo.inboxPath,
                INBOX_RETRY_CONFIG,
              )
              if (unreadMessages.length > 0) {
                await markInboxAsRead(inboxInfo.inboxPath)
                resumePrompt = formatInboxPrompt(unreadMessages)
                console.log(`[Agent 编排] 使用 ${unreadMessages.length} 条 inbox 消息构建 resume prompt`)
              }
            }

            // Fallback：用 task_notification summaries
            if (!resumePrompt && taskNotificationSummaries.length > 0) {
              console.log(`[Agent 编排] Inbox 为空，使用 ${taskNotificationSummaries.length} 条 task summaries 作为 fallback`)
              resumePrompt = formatSummaryFallbackPrompt(taskNotificationSummaries)
            }

            if (resumePrompt && this.activeSessions.has(sessionId)) {
              const resumeMessageId = randomUUID()
              this.eventBus.emit(sessionId, { type: 'resume_start', messageId: resumeMessageId })

              // 创建 resume 查询（使用相同的 SDK session ID）
              let resumeText = ''
              const resumeEvents: AgentEvent[] = []

              try {
                const resumeOptions: ClaudeAgentQueryOptions = {
                  ...queryOptions,
                  prompt: resumePrompt,
                  resumeSessionId: capturedSdkSessionId,
                }

                for await (const event of this.adapter.query(resumeOptions)) {
                  if (!this.activeSessions.has(sessionId)) break

                  if (event.type === 'text_delta') {
                    resumeText += event.text
                  }
                  resumeEvents.push(event)
                  this.eventBus.emit(sessionId, event)
                }

                // 持久化 resume 助手消息
                if (resumeText || resumeEvents.length > 0) {
                  persistAssistantMessageForTurn(resumeText, resumeEvents)
                }

                logTurnPhase('info', 'auto_resume_completed', {
                  resumeTextLength: resumeText.length,
                  resumeEventCount: resumeEvents.length,
                }, 'Agent auto-resume completed')
                console.log(`[Agent 编排] Auto-resume 完成，输出 ${resumeText.length} 字符`)
              } catch (resumeError) {
                logTurnPhase('error', 'auto_resume_failed', {
                  error: serializeDiagnosticError(resumeError),
                }, 'Agent auto-resume failed')
                console.error('[Agent 编排] Auto-resume 失败:', resumeError)
                // 已流式的部分内容已保存，继续完成流程
              }
            } else if (!resumePrompt) {
              console.log('[Agent 编排] 无可用的 resume 内容（inbox 和 summaries 均为空）')
            }
          }
          try { updateAgentSessionMeta(sessionId, {}) } catch { /* 忽略 */ }

          // 发射延迟的 complete 事件（auto-resume 已完成，前端可安全处理）
          if (deferredCompleteEvent) {
            console.log(`[Agent 编排] 发射延迟的 complete 事件`)
            this.eventBus.emit(sessionId, deferredCompleteEvent)
          }

          if (pageBuilderAgentHtmlSnapshot) {
            const pageBuilderGuardrailResult = finalizePageBuilderAgentHtmlGuardrails(
              workspaceRuntime.workspace,
              pageBuilderAgentHtmlSnapshot,
            )

            if (pageBuilderGuardrailResult.status === 'invalid') {
              const validationCodes = Array.from(new Set(
                pageBuilderGuardrailResult.validation.errors.map((diagnostic) => diagnostic.code),
              ))
              const summary = validationCodes.length > 0
                ? validationCodes.join(', ')
                : 'PREVIEW_ENTRY_MISSING'
              console.warn(
                `[Agent 编排] Page Builder CMS authoring 校验失败（${summary}），保留当前改动但不向对话注入系统提示消息`,
              )
            }
          }

          await this.autoGenerateTitle(sessionId, userMessage, callbacks)
          logTurnPhase('info', 'turn_completed', {
            resolvedModel,
            totalAssistantTextLength: accumulatedText.length,
            totalAssistantEventCount: accumulatedEvents.length,
            hasAutoResume: startedTaskIds.size > 0,
          }, 'Agent turn completed')
          callbacks.onComplete(getAgentSessionMessages(sessionId))

          break  // 成功完成，退出重试循环

        } catch (error) {
          // 打印 stderr
          const fullStderr = stderrChunks.join('').trim()
          const stderrSidecarPaths = fullStderr
            ? writeTurnTextSidecar('stderr', '.log', fullStderr)
            : []
          if (fullStderr) {
            console.error(`[Agent 编排] 完整 stderr 输出 (${fullStderr.length} 字符):`)
            console.error(fullStderr)
          } else {
            console.error(`[Agent 编排] stderr 为空`)
          }

          // 用户主动中止
          if (!this.activeSessions.has(sessionId)) {
            console.log(`[Agent 编排] 会话 ${sessionId} 已被用户中止`)
            persistAssistantMessageForTurn(accumulatedText, accumulatedEvents)
            logTurnPhase('warn', 'turn_aborted', {
              abortStage: 'catch',
              stderrSidecarPaths,
            }, 'Agent turn aborted by user')
            callbacks.onComplete(getAgentSessionMessages(sessionId))
            return
          }

          // 从 stderr 提取 API 错误
          const stderrOutput = stderrChunks.join('').trim()
          const apiError = extractApiError(stderrOutput)
          const rawErrorMessage = error instanceof Error ? error.message : ''
          const isPromptTooLong = isPromptTooLongError(
            apiError?.message ?? '',
            rawErrorMessage,
            stderrOutput,
          )
          const catchErrorSidecarPaths = writeTurnStructuredSidecar('catch-error', {
            apiError,
            rawErrorMessage,
            stderrOutput,
            error: serializeDiagnosticError(error),
          })

          if (isPromptTooLong) {
            persistAssistantMessageForTurn(accumulatedText, accumulatedEvents)
            accumulatedText = ''
            accumulatedEvents.length = 0

            const compactRecoveryResult = await attemptCompactRecovery('catch')
            if (compactRecoveryResult === 'aborted') {
              callbacks.onComplete(getAgentSessionMessages(sessionId))
              return
            }
            if (compactRecoveryResult === 'recovered') {
              skipRetryDelayOnce = attempt > 1
              attempt -= 1
              continue
            }
          }

          // 判断是否可重试
          if (isAutoRetryableCatchError(apiError, rawErrorMessage) && attempt <= MAX_AUTO_RETRIES) {
            lastRetryableError = apiError
              ? `API Error ${apiError.statusCode}: ${apiError.message}`
              : (error instanceof Error ? error.message : '未知错误')
            logTurnPhase('warn', 'catch_error_retry_scheduled', {
              apiStatusCode: apiError?.statusCode ?? null,
              reason: lastRetryableError,
              stderrSidecarPaths,
              catchErrorSidecarPaths,
            }, 'Agent retry scheduled from catch error')
            console.log(`[Agent 编排] 可重试错误 (catch): ${lastRetryableError}`)
            // 保存部分内容
            persistAssistantMessageForTurn(accumulatedText, accumulatedEvents)
            accumulatedText = ''
            accumulatedEvents.length = 0
            stderrChunks.length = 0
            continue  // 进入下一次 retry 循环
          }

          // 不可重试 — 走原有终止逻辑
          const errorMessage = error instanceof Error ? error.message : '未知错误'
          console.error(`[Agent 编排] 执行失败:`, error)

          // 保存已累积的部分内容
          if (accumulatedText || accumulatedEvents.length > 0) {
            try {
              persistAssistantMessageForTurn(accumulatedText, accumulatedEvents)
              console.log(`[Agent 编排] 已保存部分执行结果 (${accumulatedText.length} 字符, ${accumulatedEvents.length} 事件)`)
            } catch (saveError) {
              console.error('[Agent 编排] 保存部分内容失败:', saveError)
            }
          }

          let userFacingError: string
          if (apiError) {
            userFacingError = mapAgentFriendlyError(`API 错误 (${apiError.statusCode}):\n${apiError.message}`).userMessage
          } else {
            userFacingError = mapAgentFriendlyError(errorMessage).userMessage
          }
          const errorDetails = buildCatchErrorDetails({
            apiError,
            rawErrorMessage,
            stderrOutput,
            userFacingError,
          })
          const errorOriginal = buildCatchOriginalError({
            apiError,
            error,
            stderrOutput,
          })

          logAgentLifecycle('error', {
            phase: 'catch_error',
            requestId,
            turnId,
            sessionId,
            workspaceId: workspaceRuntime.workspace.id,
            apiStatusCode: apiError?.statusCode ?? null,
            userFacingError,
            rawErrorMessage,
            detailsCount: errorDetails?.length ?? 0,
            hasOriginalError: Boolean(errorOriginal),
            stderrSidecarPaths,
            catchErrorSidecarPaths,
          })

          // 保存错误状态消息到会话存储
          try {
            const errMsg: AgentMessage = {
              id: randomUUID(),
              role: 'status',
              content: isPromptTooLong
                ? '上下文过长：当前对话的上下文已超出模型限制，请压缩上下文或开启新会话'
                : userFacingError,
              createdAt: Date.now(),
              errorCode: isPromptTooLong ? 'prompt_too_long' : 'unknown_error',
              errorTitle: isPromptTooLong ? '上下文过长' : '执行错误',
              errorDetails,
              errorOriginal,
            }
            appendTurnConversationMessage(errMsg)
            console.log('[Agent 编排] 已保存错误状态消息到会话存储')
          } catch (saveError) {
            console.error('[Agent 编排] 保存错误消息失败:', saveError)
          }

          // 如果之前有重试记录，发送 retry_failed
          if (attempt > 1 && lastRetryableError) {
            this.eventBus.emit(sessionId, {
              type: 'retry_failed',
              finalAttempt: {
                attempt: attempt - 1,
                timestamp: Date.now(),
                reason: lastRetryableError,
                errorMessage: userFacingError,
                delaySeconds: 0,
              },
            })
          }

          logTurnPhase('error', 'turn_failed', {
            failureSource: 'catch_error',
            apiStatusCode: apiError?.statusCode ?? null,
            userFacingError,
            stderrSidecarPaths,
            catchErrorSidecarPaths,
          }, 'Agent turn failed with catch error')
          callbacks.onError(userFacingError)
          callbacks.onComplete(getAgentSessionMessages(sessionId))

          // 根据错误类型决定是否保留 sdkSessionId
          const shouldClearSession = !apiError || apiError.statusCode >= 500
          if (existingSdkSessionId && shouldClearSession) {
            try {
              updateAgentSessionMeta(sessionId, { sdkSessionId: undefined })
              console.log(`[Agent 编排] 已清除失效的 sdkSessionId`)
            } catch { /* 忽略 */ }
          } else if (existingSdkSessionId && !shouldClearSession) {
            console.log(`[Agent 编排] 保留 sdkSessionId (API 错误 ${apiError?.statusCode})`)
          }

          throw error
        }
      }

      // 重试循环结束（达到最大次数仍失败）
      if (!retrySucceeded && lastRetryableError) {
        this.eventBus.emit(sessionId, {
          type: 'retry_failed',
          finalAttempt: {
            attempt: MAX_AUTO_RETRIES,
            timestamp: Date.now(),
            reason: lastRetryableError,
            errorMessage: `重试 ${MAX_AUTO_RETRIES} 次后仍然失败`,
            delaySeconds: 0,
          },
        })

        // 保存错误消息
        const retryErrorMsg: AgentMessage = {
          id: randomUUID(),
          role: 'status',
          content: `重试 ${MAX_AUTO_RETRIES} 次后仍然失败: ${lastRetryableError}`,
          createdAt: Date.now(),
          errorCode: 'unknown_error',
          errorTitle: '重试失败',
        }
        appendTurnConversationMessage(retryErrorMsg)

        logTurnPhase('error', 'turn_failed_after_retries', {
          reason: lastRetryableError,
          maxAutoRetries: MAX_AUTO_RETRIES,
        }, 'Agent turn failed after exhausting retries')
        callbacks.onError(`重试 ${MAX_AUTO_RETRIES} 次后仍然失败: ${lastRetryableError}`)
        callbacks.onComplete(getAgentSessionMessages(sessionId))
      }

    } finally {
      this.activeSessions.delete(sessionId)
      logAgentLifecycle('info', {
        phase: 'active_session_delete',
        requestId,
        turnId,
        sessionId,
        workspaceId: workspaceRuntime.workspace.id,
        activeCount: this.activeSessions.size,
      })
      permissionService.clearSessionPending(sessionId)
      askUserService.clearSessionPending(sessionId)
    }
  }

  /**
   * 中止指定会话的 Agent 执行
   *
   * 先从 activeSessions 移除（供 sendMessage catch 块检测用户中止），
   * 再调用 adapter.abort() 中止底层 SDK 进程。
   */
  stop(sessionId: string): void {
    this.activeSessions.delete(sessionId)
    this.adapter.abort(sessionId)
    logAgentLifecycle('info', {
      phase: 'stop',
      sessionId,
      activeCount: this.activeSessions.size,
    })
    console.log(`[Agent 编排] 已中止会话: ${sessionId}`)
  }

  /** 检查指定会话是否正在处理中 */
  isActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId)
  }

  /** 中止所有活跃的 Agent 会话（应用退出时调用） */
  stopAll(): void {
    if (this.activeSessions.size === 0) return
    logAgentLifecycle('info', {
      phase: 'stop_all',
      activeCount: this.activeSessions.size,
    })
    console.log(`[Agent 编排] 正在中止所有活跃会话 (${this.activeSessions.size} 个)...`)
    this.adapter.dispose()
    this.activeSessions.clear()
  }
}
