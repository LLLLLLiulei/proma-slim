import type { DiagnosticLogger } from '../diagnostic-logging'
import { getDiagnosticBackendLogger, serializeDiagnosticError } from '../diagnostic-logging'

export interface ImageSearchRuntimeTrace {
  requestId?: string | null
  turnId?: string | null
  sessionId?: string | null
  workspaceId?: string | null
  workspaceSlug?: string | null
}

export interface ImageSearchRuntimeLogger extends DiagnosticLogger {}

interface ImageSearchLogSink {
  info?: (payload?: unknown, message?: string) => void
  warn?: (payload?: unknown, message?: string) => void
  error?: (payload?: unknown, message?: string) => void
}

function sanitizeForLog(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item, seen))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  if (seen.has(value)) {
    return '[Circular]'
  }
  seen.add(value)

  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined || key === 'raw') continue
    const normalizedKey = key.toLowerCase().replace(/[-_]/g, '')
    if (
      normalizedKey === 'apikey'
      || normalizedKey === 'key'
      || normalizedKey === 'authorization'
      || normalizedKey === 'token'
      || normalizedKey === 'accesstoken'
      || normalizedKey === 'refreshtoken'
      || normalizedKey.includes('secret')
      || normalizedKey.includes('password')
    ) {
      output[key] = child ? '[configured]' : child
      continue
    }
    output[key] = sanitizeForLog(child, seen)
  }
  return output
}

export function flattenImageSearchLogPayload(value: unknown, prefix = ''): Record<string, unknown> {
  const sanitized = sanitizeForLog(value)
  const flat: Record<string, unknown> = {}

  const visit = (current: unknown, currentPath: string) => {
    if (current === undefined) return
    if (Array.isArray(current)) {
      if (current.length === 0 && currentPath) {
        flat[currentPath] = '[]'
        return
      }
      current.forEach((item, index) => visit(item, currentPath ? `${currentPath}.${index}` : String(index)))
      return
    }

    if (current && typeof current === 'object') {
      const entries = Object.entries(current as Record<string, unknown>)
      if (entries.length === 0 && currentPath) {
        flat[currentPath] = '{}'
        return
      }
      for (const [key, child] of entries) {
        visit(child, currentPath ? `${currentPath}.${key}` : key)
      }
      return
    }

    if (currentPath) {
      flat[currentPath] = current
    }
  }

  visit(sanitized, prefix)
  return flat
}

export function createImageSearchRuntimeLogger(trace?: ImageSearchRuntimeTrace | null): ImageSearchRuntimeLogger {
  return getDiagnosticBackendLogger({
    component: 'image_search_runtime',
    category: 'mcp_tool',
    requestId: trace?.requestId ?? null,
    turnId: trace?.turnId ?? null,
    sessionId: trace?.sessionId ?? null,
    workspaceId: trace?.workspaceId ?? null,
    workspaceSlug: trace?.workspaceSlug ?? null,
  }) as ImageSearchRuntimeLogger
}

export function logImageSearchInfo(
  logger: ImageSearchLogSink | undefined,
  phase: string,
  payload: Record<string, unknown> = {},
  message = '图片搜索 MCP 执行日志',
): void {
  logger?.info?.({ phase, ...flattenImageSearchLogPayload(payload) }, message)
}

export function logImageSearchWarn(
  logger: ImageSearchLogSink | undefined,
  phase: string,
  payload: Record<string, unknown> = {},
  message = '图片搜索 MCP 执行警告',
): void {
  logger?.warn?.({ phase, ...flattenImageSearchLogPayload(payload) }, message)
}

export function logImageSearchError(
  logger: ImageSearchLogSink | undefined,
  phase: string,
  payload: Record<string, unknown> = {},
  message = '图片搜索 MCP 执行失败',
): void {
  logger?.error?.({ phase, ...flattenImageSearchLogPayload(payload) }, message)
}

export function serializeImageSearchLogError(error: unknown): Record<string, unknown> {
  return serializeDiagnosticError(error)
}
