import { getDiagnosticBackendLogger } from './diagnostic-logging'

export type CmsUpstreamOperation =
  | 'login_validate'
  | 'token_refresh'
  | 'api_request'
  | 'asset_fetch'

interface CmsUpstreamBaseLogInput {
  operation: CmsUpstreamOperation
  method: string
  url: string | URL
  requestHeaders?: HeadersInit
  requestBody?: unknown
  startedAt?: number
}

interface CmsUpstreamResponseLogInput extends CmsUpstreamBaseLogInput {
  response: Response
  responseBody?: string | null
}

interface CmsUpstreamFailureLogInput extends CmsUpstreamBaseLogInput {
  error: unknown
}

interface CmsUpstreamFailureMessageInput {
  prefix: string
  url: string | URL
  response?: Response
  payload?: unknown
  rawText?: string
  error?: unknown
  fallbackDetail?: string
}

export function logCmsUpstreamRequestStart(input: CmsUpstreamBaseLogInput): void {
  getCmsUpstreamLogger().info({
    ...buildBaseLogPayload('request_start', input),
  }, 'CMS 上游请求开始')
}

export function logCmsUpstreamResponse(input: CmsUpstreamResponseLogInput): void {
  const payload = {
    ...buildBaseLogPayload(input.response.ok ? 'request_success' : 'request_failure', input),
    responseStatus: input.response.status,
    responseStatusText: input.response.statusText,
    responseHeaders: headersToRecord(input.response.headers),
    responseBody: input.responseBody ?? undefined,
    contentType: input.response.headers.get('content-type') ?? undefined,
    contentLength: input.response.headers.get('content-length') ?? undefined,
  }
  const message = input.response.ok ? 'CMS 上游请求完成' : 'CMS 上游请求失败'

  if (input.response.ok) {
    getCmsUpstreamLogger().info(payload, message)
  } else {
    getCmsUpstreamLogger().warn(payload, message)
  }
}

export function logCmsUpstreamRequestFailure(input: CmsUpstreamFailureLogInput): void {
  getCmsUpstreamLogger().error({
    ...buildBaseLogPayload('request_failure', input),
    error: serializeRawError(input.error),
  }, 'CMS 上游请求异常')
}

export function logCmsTokenCacheHit(input: {
  baseUrl: string
  expiresAt: number
}): void {
  getCmsUpstreamLogger().debug({
    phase: 'token_cache_hit',
    operation: 'token_refresh',
    baseUrl: input.baseUrl,
    expiresAt: input.expiresAt,
  }, 'CMS token 缓存命中')
}

export function logCmsTokenInvalidatedRetry(input: {
  url: string | URL
  reason: string
}): void {
  const normalizedUrl = normalizeUrl(input.url)
  getCmsUpstreamLogger().warn({
    phase: 'token_invalidated_retry',
    operation: 'api_request',
    url: normalizedUrl.href,
    pathname: normalizedUrl.pathname,
    query: Object.fromEntries(normalizedUrl.searchParams.entries()),
    reason: input.reason,
  }, 'CMS token 已失效，清理缓存后重试')
}

function getCmsUpstreamLogger() {
  return getDiagnosticBackendLogger({
    component: 'cms_upstream',
    category: 'upstream',
  })
}

export function headersToRecord(headers: HeadersInit | undefined): Record<string, string> | undefined {
  if (!headers) {
    return undefined
  }

  const result: Record<string, string> = {}
  const normalized = new Headers(headers)
  normalized.forEach((value, key) => {
    result[key] = value
  })
  return result
}

export function buildCmsUpstreamFailureMessage(input: CmsUpstreamFailureMessageInput): string {
  const normalizedUrl = normalizeUrl(input.url)
  const parts: string[] = []
  if (input.response) {
    parts.push(`HTTP ${input.response.status}`)
  }
  parts.push(normalizedUrl.pathname)

  const detail = extractCmsUpstreamDetail(input)
  return detail
    ? `${input.prefix}（${parts.join('，')}）：${detail}`
    : `${input.prefix}（${parts.join('，')}）`
}

export function extractCmsPayloadMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const record = payload as Record<string, unknown>
  const candidates = [
    record.message,
    record.msg,
    record.error,
    readNestedValue(record, ['data', 'message']),
    readNestedValue(record, ['data', 'msg']),
    readNestedValue(record, ['error', 'message']),
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return ''
}

export function parseCmsJsonSafely(value: string): unknown {
  if (!value.trim()) {
    return {}
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    return {}
  }
}

function buildBaseLogPayload(phase: string, input: CmsUpstreamBaseLogInput): Record<string, unknown> {
  const normalizedUrl = normalizeUrl(input.url)
  return {
    phase,
    operation: input.operation,
    method: input.method,
    url: normalizedUrl.href,
    pathname: normalizedUrl.pathname,
    query: Object.fromEntries(normalizedUrl.searchParams.entries()),
    requestHeaders: headersToRecord(input.requestHeaders),
    requestBody: serializeRequestBody(input.requestBody),
    durationMs: input.startedAt === undefined ? undefined : Date.now() - input.startedAt,
  }
}

function serializeRequestBody(value: unknown): unknown {
  if (value === undefined || value === null) {
    return value
  }

  if (typeof value === 'string') {
    return value
  }

  if (value instanceof URLSearchParams) {
    return Object.fromEntries(value.entries())
  }

  if (typeof FormData !== 'undefined' && value instanceof FormData) {
    const entries: Record<string, unknown> = {}
    value.forEach((child, key) => {
      entries[key] = typeof child === 'string'
        ? child
        : {
            name: child.name,
            size: child.size,
            type: child.type,
          }
    })
    return entries
  }

  return value
}

function extractCmsUpstreamDetail(input: CmsUpstreamFailureMessageInput): string {
  if (input.error) {
    return extractUnknownErrorMessage(input.error)
  }

  const payloadMessage = extractCmsPayloadMessage(input.payload)
  if (payloadMessage) {
    return payloadMessage
  }

  const rawText = input.rawText?.trim()
  if (rawText) {
    return rawText
  }

  return input.fallbackDetail?.trim() ?? ''
}

function serializeRawError(error: unknown): Record<string, unknown> {
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

function extractUnknownErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return String(error)
}

function normalizeUrl(value: string | URL): URL {
  return value instanceof URL ? value : new URL(value)
}

function readNestedValue(record: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = record
  for (const segment of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined
    }
    current = (current as Record<string, unknown>)[segment]
  }

  return current
}
