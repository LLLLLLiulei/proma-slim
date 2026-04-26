import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { AppSettings, DiagnosticLogLevel, DiagnosticLoggingSettings } from '../../types'
import {
  DEFAULT_DIAGNOSTIC_LOG_LEVEL,
  DEFAULT_DIAGNOSTIC_MAX_FILE_SIZE_BYTES,
  DEFAULT_DIAGNOSTIC_RETENTION,
} from '../../types'
import { getLogsDir } from './config-paths'
import { pruneTurnSidecarDirectories } from './diagnostic-sidecar-writer'
import { getSettings } from './settings-service'

export {
  DEFAULT_DIAGNOSTIC_LOG_LEVEL,
  DEFAULT_DIAGNOSTIC_MAX_FILE_SIZE_BYTES,
  DEFAULT_DIAGNOSTIC_RETENTION,
} from '../../types'

export interface DiagnosticLoggingRuntime {
  logsDir: string
  backendLogsDir: string
  backendLogFilePath: string
  previewAccessLogsDir: string
  previewAccessLogFilePath: string
  turnsDir: string
  level: DiagnosticLogLevel
  maxFileSizeBytes: number
  retention: Required<NonNullable<DiagnosticLoggingSettings['retention']>>
}

export interface RequestTraceContext {
  requestId: string
  method?: string
  path?: string
}

export interface TurnTraceContext {
  requestId: string
  turnId: string
  sessionId: string
  workspaceId?: string | null
}

export interface SseConnectionTraceContext {
  requestId?: string
  turnId?: string
  sessionId?: string
  sseConnectionId: string
}

export interface DiagnosticFileMetadata {
  fieldName?: string
  filename: string
  mediaType?: string | null
  size?: number
  localPath?: string
  attachmentId?: string
}

export interface StructuredRequestPayloadInput {
  contentType?: string | null
  body: unknown
  files?: DiagnosticFileMetadata[]
}

export interface StructuredRequestPayload {
  contentType: string | null
  body: unknown
  files?: DiagnosticFileMetadata[]
}

export interface AgentSendDiagnosticContext {
  requestTrace?: RequestTraceContext
  turnTrace?: TurnTraceContext
  structuredRequestPayload?: StructuredRequestPayload
  appOrigin?: string
}

export interface DiagnosticLogger {
  child(bindings: Record<string, unknown>): DiagnosticLogger
  trace(payload?: unknown, message?: string): void
  debug(payload?: unknown, message?: string): void
  info(payload?: unknown, message?: string): void
  warn(payload?: unknown, message?: string): void
  error(payload?: unknown, message?: string): void
  fatal(payload?: unknown, message?: string): void
}

interface DiagnosticLoggerState {
  signature: string
  runtime: DiagnosticLoggingRuntime
  backendLogger: DiagnosticLogger
  previewAccessLogger: DiagnosticLogger
  backendWriter: RollingTextLogWriter
  previewAccessWriter: RollingTextLogWriter
}

const PREVIEW_ACCESS_PATH_PATTERNS = [
  /^\/api\/workspaces\/[^/]+\/preview(?:\/|$)/,
  /^\/api\/page-builder\/preview-bridge\.js$/,
  /^\/api\/page-builder\/cms-rendering-preview\.js$/,
  /^\/api\/page-builder\/cms-rendering-vue\.js$/,
  /^\/api\/page-builder\/cms\/assets(?:\/|$)/,
] as const

const SKIPPED_HTTP_ACCESS_LOG_PATH_PATTERNS = [
  /^\/api\/workspaces\/[^/]+\/preview-state$/,
] as const

const ONE_DAY_MS = 24 * 60 * 60 * 1000

const LOG_LEVEL_VALUES: Record<DiagnosticLogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
}

const LOG_ENTRY_PRIORITY_KEYS = [
  'message',
  'phase',
  'requestId',
  'turnId',
  'sessionId',
  'workspaceId',
  'sseConnectionId',
  'accessChannel',
  'method',
  'path',
  'status',
  'durationMs',
] as const

const PHASE_DESCRIPTION_MAP: Readonly<Record<string, string>> = {
  request_start: '收到 HTTP 请求',
  request_complete: 'HTTP 请求已完成',
  request_exception: 'HTTP 请求在返回前抛出异常',
  route_error: 'HTTP 路由处理失败',
  session_activity: '会话活动请求已处理',
  request_body_parsed: '发送请求体已解析完成',
  callbacks_error: '发送回调返回错误',
  callbacks_complete: '发送回调已完成',
  callbacks_title_updated: '会话标题已更新',
  send_rejected_busy: '发送请求被拒绝，上一条消息仍在处理中',
  send_accepted: '发送请求已受理',
  send_run_failed: '发送请求在流式执行阶段失败',
  connection_open: 'SSE 连接已建立',
  connection_cancel: 'SSE 连接已被客户端取消',
  emit_failed: 'SSE 事件推送失败',
  connection_on_close_failed: 'SSE 连接关闭回调执行失败',
  connection_close: 'SSE 连接已关闭',
  active_session_add: '会话已标记为处理中',
  active_session_delete: '会话处理标记已清理',
  stop: '当前会话已停止',
  stop_all: '全部会话已停止',
  sidecar_written: '诊断 sidecar 已写入',
  sidecar_write_failed: '诊断 sidecar 写入失败',
  request_received: '已收到对话发送请求',
  reject_busy: '对话发送因会话繁忙被拒绝',
  runtime_shell_missing: '运行环境缺少 shell',
  api_key_missing: '缺少 Agent API Key',
  sdk_bootstrap_failed: 'SDK 启动失败',
  sdk_cli_missing: '缺少 SDK CLI',
  user_message_persist_failed: '用户消息持久化失败',
  user_message_persisted: '用户消息已持久化',
  dynamic_context_built: '动态上下文已构建',
  prompt_built: 'Prompt 已组装完成',
  sdk_stderr_chunk: '收到 SDK stderr 输出片段',
  sdk_session_resolved: '上游 SDK 会话已解析',
  sdk_model_resolved: '上游模型已解析',
  sdk_context_window: '上下文窗口信息已解析',
  sdk_query_started: '已开始请求上游模型',
  compact_recovery_unavailable: 'compact 恢复不可用',
  compact_recovery_started: '已开始 compact 恢复',
  turn_aborted: '对话处理已中止',
  compact_recovery_typed_error: 'compact 恢复返回 typed error',
  compact_recovery_error: 'compact 恢复执行失败',
  compact_recovery_succeeded: 'compact 恢复成功',
  compact_recovery_failed: 'compact 恢复失败',
  retry_scheduled: '已安排自动重试',
  first_event_received: '已收到首个上游事件',
  typed_error_retry_scheduled: 'typed error 后已安排自动重试',
  typed_error_persisted: 'typed error 已持久化',
  turn_failed: '对话处理失败',
  watchdog_aborted_stream_loop: '看门狗已终止流式循环',
  retry_cleared: '自动重试状态已清理',
  assistant_message_persisted: '助手消息已持久化',
  auto_resume_started: '已开始自动恢复',
  auto_resume_completed: '自动恢复已完成',
  auto_resume_failed: '自动恢复失败',
  turn_completed: '对话处理已完成',
  catch_error_retry_scheduled: '捕获异常后已安排自动重试',
  catch_error: '捕获到未归类异常',
  turn_failed_after_retries: '多次重试后对话仍失败',
  copying: '正在复制导出产物',
  scanning: '正在扫描导出资源',
  packaging: '正在打包导出结果',
  completed: '处理已完成',
}

let diagnosticLoggerState: DiagnosticLoggerState | null = null

function ensureDir(dir: string): string {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return dir
}

function normalizeDiagnosticLoggingSettings(
  settings?: DiagnosticLoggingSettings | null,
): Required<DiagnosticLoggingSettings> & {
  retention: Required<NonNullable<DiagnosticLoggingSettings['retention']>>
} {
  const level = settings?.level ?? DEFAULT_DIAGNOSTIC_LOG_LEVEL
  const maxFileSizeBytes = settings?.maxFileSizeBytes && settings.maxFileSizeBytes > 0
    ? Math.floor(settings.maxFileSizeBytes)
    : DEFAULT_DIAGNOSTIC_MAX_FILE_SIZE_BYTES

  return {
    level,
    maxFileSizeBytes,
    retention: {
      maxArchiveFiles: settings?.retention?.maxArchiveFiles && settings.retention.maxArchiveFiles > 0
        ? Math.floor(settings.retention.maxArchiveFiles)
        : DEFAULT_DIAGNOSTIC_RETENTION.maxArchiveFiles,
      maxTurnDirectories: settings?.retention?.maxTurnDirectories && settings.retention.maxTurnDirectories > 0
        ? Math.floor(settings.retention.maxTurnDirectories)
        : DEFAULT_DIAGNOSTIC_RETENTION.maxTurnDirectories,
      maxAgeDays: settings?.retention?.maxAgeDays && settings.retention.maxAgeDays > 0
        ? Math.floor(settings.retention.maxAgeDays)
        : DEFAULT_DIAGNOSTIC_RETENTION.maxAgeDays,
    },
  }
}

export function resolveDiagnosticLoggingRuntime(
  settings?: DiagnosticLoggingSettings | null,
): DiagnosticLoggingRuntime {
  const normalized = normalizeDiagnosticLoggingSettings(settings)
  const logsDir = ensureDir(getLogsDir())
  const backendLogsDir = ensureDir(join(logsDir, 'backend'))
  const previewAccessLogsDir = ensureDir(join(logsDir, 'access-preview'))
  const turnsDir = ensureDir(join(logsDir, 'turns'))

  return {
    logsDir,
    backendLogsDir,
    backendLogFilePath: join(backendLogsDir, 'backend'),
    previewAccessLogsDir,
    previewAccessLogFilePath: join(previewAccessLogsDir, 'access-preview'),
    turnsDir,
    level: normalized.level,
    maxFileSizeBytes: normalized.maxFileSizeBytes,
    retention: normalized.retention,
  }
}

export function resolveDiagnosticLoggingRuntimeFromAppSettings(
  settings?: AppSettings | null,
): DiagnosticLoggingRuntime {
  return resolveDiagnosticLoggingRuntime(settings?.diagnosticLogging)
}

function buildDiagnosticLoggerSignature(runtime: DiagnosticLoggingRuntime): string {
  return JSON.stringify({
    backendLogFilePath: runtime.backendLogFilePath,
    previewAccessLogFilePath: runtime.previewAccessLogFilePath,
    turnsDir: runtime.turnsDir,
    level: runtime.level,
    maxFileSizeBytes: runtime.maxFileSizeBytes,
    retention: runtime.retention,
  })
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildActiveLogFileName(baseName: string): string {
  return `${baseName}.current.log`
}

function formatArchiveTimestamp(date: Date): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, '0')

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('')
    + '-'
    + [
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds()),
    ].join('')
    + '-'
    + pad(date.getMilliseconds(), 3)
}

function listArchivedLogFiles(filePath: string): Array<{
  entry: string
  absolutePath: string
  mtimeMs: number
}> {
  const dir = ensureDir(dirname(filePath))
  const baseName = basename(filePath)
  const activeFileName = buildActiveLogFileName(baseName)
  const archivePattern = new RegExp(`^${escapeRegex(baseName)}\\..+\\.log$`)

  return readdirSync(dir)
    .map((entry) => {
      if (entry === activeFileName || !archivePattern.test(entry)) {
        return null
      }

      const absolutePath = join(dir, entry)
      const stats = statSync(absolutePath)
      if (!stats.isFile()) {
        return null
      }

      return {
        entry,
        absolutePath,
        mtimeMs: stats.mtimeMs,
      }
    })
    .filter((entry): entry is {
      entry: string
      absolutePath: string
      mtimeMs: number
    } => Boolean(entry))
    .sort((left, right) => left.mtimeMs - right.mtimeMs || left.entry.localeCompare(right.entry))
}

class RollingTextLogWriter {
  private readonly dir: string
  private readonly baseName: string
  private currentPath: string
  private currentSize = 0
  private closed = false

  constructor(
    private readonly filePath: string,
    private readonly maxFileSizeBytes: number,
    private readonly maxArchiveFiles: number,
  ) {
    this.dir = ensureDir(dirname(filePath))
    this.baseName = basename(filePath)
    this.currentPath = this.buildActiveFilePath()
    this.archiveStaleActiveFile()
    this.pruneByCount()
  }

  write(content: string): void {
    if (this.closed || !content) {
      return
    }

    const contentBytes = Buffer.byteLength(content)
    if (this.currentSize > 0 && this.currentSize + contentBytes > this.maxFileSizeBytes) {
      this.rotate()
    }

    appendFileSync(this.currentPath, content, 'utf-8')
    this.currentSize += contentBytes
  }

  flush(): void {
    // Synchronous writes are already durable enough for the current diagnostic use case.
  }

  close(): void {
    this.closed = true
  }

  private rotate(): void {
    this.archiveCurrentFile()
    this.pruneByCount()
  }

  private pruneByCount(): void {
    const files = listArchivedLogFiles(this.filePath)
    const maxArchivedFiles = Math.max(0, this.maxArchiveFiles)

    while (files.length > maxArchivedFiles) {
      const oldest = files.shift()
      if (!oldest) {
        break
      }
      rmSync(oldest.absolutePath, { force: true })
    }
  }

  private archiveStaleActiveFile(): void {
    if (!existsSync(this.currentPath)) {
      return
    }

    const stats = statSync(this.currentPath)
    if (!stats.isFile() || stats.size <= 0) {
      rmSync(this.currentPath, { force: true })
      this.currentSize = 0
      return
    }

    this.archiveCurrentFile()
  }

  private archiveCurrentFile(): void {
    if (!existsSync(this.currentPath)) {
      this.currentSize = 0
      return
    }

    const stats = statSync(this.currentPath)
    if (!stats.isFile() || stats.size <= 0) {
      rmSync(this.currentPath, { force: true })
      this.currentSize = 0
      return
    }

    renameSync(this.currentPath, this.buildArchiveFilePath(new Date()))
    this.currentSize = 0
  }

  private buildActiveFilePath(): string {
    return join(this.dir, buildActiveLogFileName(this.baseName))
  }

  private buildArchiveFilePath(archivedAt: Date): string {
    const timestamp = formatArchiveTimestamp(archivedAt)
    let collisionSuffix = 0

    while (true) {
      const suffix = collisionSuffix > 0 ? `-${collisionSuffix}` : ''
      const candidate = join(this.dir, `${this.baseName}.${timestamp}${suffix}.log`)
      if (!existsSync(candidate)) {
        return candidate
      }
      collisionSuffix += 1
    }
  }
}

function formatSimpleScalar(value: unknown): string | null {
  if (value === null) return 'null'
  if (value === undefined) return null

  if (typeof value === 'string') {
    return value.includes('\n') ? null : value
  }

  if (
    typeof value === 'number'
    || typeof value === 'boolean'
    || typeof value === 'bigint'
  ) {
    return String(value)
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  return null
}

function buildPhaseDescription(phase: string | null | undefined): string | null {
  if (!phase) {
    return null
  }

  return PHASE_DESCRIPTION_MAP[phase] ?? null
}

function formatInlineString(value: string): string {
  const normalized = value
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')

  if (/^[A-Za-z0-9._:/@-]+$/.test(normalized)) {
    return normalized
  }

  return JSON.stringify(normalized)
}

function formatInlineValue(value: unknown): string {
  const simple = formatSimpleScalar(value)
  if (simple !== null) {
    return formatInlineString(simple)
  }

  return formatInlineString(serializeTextValue(value).replace(/\s*\n\s*/g, ' | '))
}

function indentLines(text: string, spaces: number): string {
  const prefix = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n')
}

function serializeTextValue(value: unknown, indent = 0, seen = new WeakSet<object>()): string {
  const simple = formatSimpleScalar(value)
  if (simple !== null) {
    return simple
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]'
    }

    return value
      .map((item) => {
        const itemSimple = formatSimpleScalar(item)
        if (itemSimple !== null) {
          return `${' '.repeat(indent)}- ${itemSimple}`
        }

        const nested = serializeTextValue(item, indent + 2, seen)
        return `${' '.repeat(indent)}-\n${indentLines(nested, indent + 2)}`
      })
      .join('\n')
  }

  if (typeof value === 'object' && value) {
    if (seen.has(value)) {
      return '[Circular]'
    }
    seen.add(value)

    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, childValue]) => childValue !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))

    if (entries.length === 0) {
      return '{}'
    }

    return entries
      .map(([key, childValue]) => {
        const childSimple = formatSimpleScalar(childValue)
        if (childSimple !== null) {
          return `${' '.repeat(indent)}${key}: ${childSimple}`
        }

        const nested = serializeTextValue(childValue, indent + 2, seen)
        return `${' '.repeat(indent)}${key}:\n${indentLines(nested, indent + 2)}`
      })
      .join('\n')
  }

  return String(value)
}

export function serializeDiagnosticText(value: unknown): string {
  return serializeTextValue(value)
}

function buildOrderedLogFields(fields: Record<string, unknown>): Array<[string, unknown]> {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined)
  const priorityKeys = new Set<string>(LOG_ENTRY_PRIORITY_KEYS)
  const ordered: Array<[string, unknown]> = []

  for (const key of LOG_ENTRY_PRIORITY_KEYS) {
    const entry = entries.find(([entryKey]) => entryKey === key)
    if (entry) {
      ordered.push(entry)
    }
  }

  const remaining = entries
    .filter(([key]) => !priorityKeys.has(key))
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))

  return [...ordered, ...remaining]
}

function formatDiagnosticLogEntry(entry: Record<string, unknown>): string {
  const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : new Date().toISOString()
  const level = typeof entry.level === 'string' ? entry.level.toUpperCase() : 'INFO'
  const component = typeof entry.component === 'string' ? entry.component : 'diagnostic'
  const category = typeof entry.category === 'string' ? entry.category : 'general'
  const phase = typeof entry.phase === 'string' ? entry.phase : null
  const summary = buildPhaseDescription(phase)
  const bodyFields = buildOrderedLogFields({
    ...entry,
    timestamp: undefined,
    level: undefined,
    component: undefined,
    category: undefined,
  })

  const segments = [
    `[${timestamp}]`,
    level,
    component,
    category,
    ...(summary ? [`说明=${formatInlineString(summary)}`] : []),
    ...bodyFields.map(([key, value]) => `${key}=${formatInlineValue(value)}`),
  ]

  return `${segments.join(' ')}\n`
}

class TextDiagnosticLogger implements DiagnosticLogger {
  constructor(
    private readonly writer: RollingTextLogWriter,
    private readonly levelThreshold: DiagnosticLogLevel,
    private readonly bindings: Record<string, unknown> = {},
  ) {}

  child(bindings: Record<string, unknown>): DiagnosticLogger {
    return new TextDiagnosticLogger(this.writer, this.levelThreshold, {
      ...this.bindings,
      ...bindings,
    })
  }

  trace(payload?: unknown, message?: string): void {
    this.log('trace', payload, message)
  }

  debug(payload?: unknown, message?: string): void {
    this.log('debug', payload, message)
  }

  info(payload?: unknown, message?: string): void {
    this.log('info', payload, message)
  }

  warn(payload?: unknown, message?: string): void {
    this.log('warn', payload, message)
  }

  error(payload?: unknown, message?: string): void {
    this.log('error', payload, message)
  }

  fatal(payload?: unknown, message?: string): void {
    this.log('fatal', payload, message)
  }

  private log(level: DiagnosticLogLevel, payload?: unknown, message?: string): void {
    if (LOG_LEVEL_VALUES[level] < LOG_LEVEL_VALUES[this.levelThreshold]) {
      return
    }

    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      ...this.bindings,
    }

    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      Object.assign(entry, payload as Record<string, unknown>)
    } else if (typeof payload === 'string' && message === undefined) {
      entry.message = payload
    } else if (payload !== undefined) {
      entry.payload = payload
    }

    if (message !== undefined) {
      entry.message = message
    }

    this.writer.write(formatDiagnosticLogEntry(entry))
  }
}

function createDiagnosticLogger(
  filePath: string,
  level: DiagnosticLogLevel,
  maxFileSizeBytes: number,
  maxArchiveFiles: number,
): {
  logger: DiagnosticLogger
  writer: RollingTextLogWriter
} {
  const writer = new RollingTextLogWriter(filePath, maxFileSizeBytes, maxArchiveFiles)
  const logger = new TextDiagnosticLogger(writer, level)

  return {
    logger,
    writer,
  }
}

function pruneExpiredArchivedLogFiles(filePath: string, maxAgeMs: number): void {
  if (maxAgeMs <= 0) {
    return
  }

  const cutoff = Date.now() - maxAgeMs
  const files = listArchivedLogFiles(filePath)

  for (const file of files) {
    if (file.mtimeMs >= cutoff) {
      continue
    }
    rmSync(file.absolutePath, { force: true })
  }
}

function pruneDiagnosticArchives(runtime: DiagnosticLoggingRuntime): void {
  const maxAgeMs = runtime.retention.maxAgeDays > 0
    ? runtime.retention.maxAgeDays * ONE_DAY_MS
    : 0

  if (maxAgeMs > 0) {
    pruneExpiredArchivedLogFiles(runtime.backendLogFilePath, maxAgeMs)
    pruneExpiredArchivedLogFiles(runtime.previewAccessLogFilePath, maxAgeMs)
  }

  pruneTurnSidecarDirectories({
    turnsDir: runtime.turnsDir,
    maxTurnDirectories: runtime.retention.maxTurnDirectories,
    ...(maxAgeMs > 0 ? { maxAgeMs } : {}),
  })
}

function ensureDiagnosticLoggerState(
  settings?: AppSettings | DiagnosticLoggingSettings | null,
): DiagnosticLoggerState {
  const resolvedSettings = settings ?? getSettings()
  const runtime = resolvedSettings && 'themeMode' in resolvedSettings
    ? resolveDiagnosticLoggingRuntimeFromAppSettings(resolvedSettings)
    : resolveDiagnosticLoggingRuntime(resolvedSettings ?? undefined)
  const signature = buildDiagnosticLoggerSignature(runtime)
  if (diagnosticLoggerState && diagnosticLoggerState.signature === signature) {
    return diagnosticLoggerState
  }

  if (diagnosticLoggerState) {
    void closeDiagnosticLoggers()
  }

  pruneDiagnosticArchives(runtime)

  const backend = createDiagnosticLogger(
    runtime.backendLogFilePath,
    runtime.level,
    runtime.maxFileSizeBytes,
    runtime.retention.maxArchiveFiles,
  )
  const previewAccess = createDiagnosticLogger(
    runtime.previewAccessLogFilePath,
    runtime.level,
    runtime.maxFileSizeBytes,
    runtime.retention.maxArchiveFiles,
  )

  diagnosticLoggerState = {
    signature,
    runtime,
    backendLogger: backend.logger,
    previewAccessLogger: previewAccess.logger,
    backendWriter: backend.writer,
    previewAccessWriter: previewAccess.writer,
  }

  return diagnosticLoggerState
}

export function shouldUsePreviewAccessLogger(path: string): boolean {
  return PREVIEW_ACCESS_PATH_PATTERNS.some((pattern) => pattern.test(path))
}

export function shouldSkipHttpAccessLogging(path: string): boolean {
  return SKIPPED_HTTP_ACCESS_LOG_PATH_PATTERNS.some((pattern) => pattern.test(path))
}

export function getDiagnosticLoggingRuntimeState(
  settings?: AppSettings | DiagnosticLoggingSettings | null,
): DiagnosticLoggingRuntime {
  return ensureDiagnosticLoggerState(settings).runtime
}

export function getDiagnosticBackendLogger(bindings: Record<string, unknown> = {}): DiagnosticLogger {
  return ensureDiagnosticLoggerState().backendLogger.child(bindings)
}

export function getDiagnosticPreviewAccessLogger(bindings: Record<string, unknown> = {}): DiagnosticLogger {
  return ensureDiagnosticLoggerState().previewAccessLogger.child(bindings)
}

export function getHttpAccessLogger(
  path: string,
  bindings: Record<string, unknown> = {},
): DiagnosticLogger {
  const previewAccess = shouldUsePreviewAccessLogger(path)
  const rootLogger = previewAccess
    ? getDiagnosticPreviewAccessLogger
    : getDiagnosticBackendLogger

  return rootLogger({
    component: 'http',
    category: 'access',
    accessChannel: previewAccess ? 'preview' : 'default',
    ...bindings,
  })
}

export async function flushDiagnosticLoggers(): Promise<void> {
  const currentState = diagnosticLoggerState
  if (!currentState) {
    return
  }

  currentState.backendWriter.flush()
  currentState.previewAccessWriter.flush()
}

export async function closeDiagnosticLoggers(): Promise<void> {
  const currentState = diagnosticLoggerState
  diagnosticLoggerState = null
  if (!currentState) {
    return
  }

  currentState.backendWriter.flush()
  currentState.previewAccessWriter.flush()
  currentState.backendWriter.close()
  currentState.previewAccessWriter.close()
}

export function serializeDiagnosticError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return {
    message: String(error),
    raw: error,
  }
}

export function buildSidecarSummary(paths: string[]): {
  sidecarFileCount: number
  sidecarPaths: string[]
  sidecarBaseName: string | null
} {
  return {
    sidecarFileCount: paths.length,
    sidecarPaths: paths,
    sidecarBaseName: paths[0] ? basename(paths[0]) : null,
  }
}

export function createRequestTraceContext(input?: {
  requestId?: string
  method?: string
  path?: string
}): RequestTraceContext {
  return {
    requestId: input?.requestId?.trim() || randomUUID(),
    ...(input?.method ? { method: input.method } : {}),
    ...(input?.path ? { path: input.path } : {}),
  }
}

export function createTurnTraceContext(input: {
  requestId: string
  turnId?: string
  sessionId: string
  workspaceId?: string | null
}): TurnTraceContext {
  return {
    requestId: input.requestId,
    turnId: input.turnId?.trim() || randomUUID(),
    sessionId: input.sessionId,
    ...(input.workspaceId !== undefined ? { workspaceId: input.workspaceId } : {}),
  }
}

export function createSseConnectionTraceContext(input?: {
  requestId?: string
  turnId?: string
  sessionId?: string
  sseConnectionId?: string
}): SseConnectionTraceContext {
  return {
    ...(input?.requestId ? { requestId: input.requestId } : {}),
    ...(input?.turnId ? { turnId: input.turnId } : {}),
    ...(input?.sessionId ? { sessionId: input.sessionId } : {}),
    sseConnectionId: input?.sseConnectionId?.trim() || randomUUID(),
  }
}

export function buildStructuredRequestPayload(
  input: StructuredRequestPayloadInput,
): StructuredRequestPayload {
  return {
    contentType: input.contentType ?? null,
    body: input.body,
    ...(input.files && input.files.length > 0 ? {
      files: input.files.map((file) => ({
        ...(file.fieldName ? { fieldName: file.fieldName } : {}),
        filename: file.filename,
        ...(file.mediaType !== undefined ? { mediaType: file.mediaType } : {}),
        ...(file.size !== undefined ? { size: file.size } : {}),
        ...(file.localPath ? { localPath: file.localPath } : {}),
        ...(file.attachmentId ? { attachmentId: file.attachmentId } : {}),
      })),
    } : {}),
  }
}
