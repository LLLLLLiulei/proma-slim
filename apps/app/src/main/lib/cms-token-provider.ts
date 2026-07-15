import type { PageBuilderCmsConfig } from './page-builder-cms-config'
import {
  buildCmsUpstreamFailureMessage,
  extractCmsPayloadMessage,
  logCmsTokenCacheHit,
  logCmsUpstreamRequestFailure,
  logCmsUpstreamRequestStart,
  logCmsUpstreamResponse,
  parseCmsJsonSafely,
} from './cms-upstream-diagnostics'

const DEFAULT_REFRESH_SKEW_MS = 30_000

export interface CmsAuthorizationProvider {
  getAuthorizationHeader(): Promise<string>
  invalidateAuthorizationHeader?(): void
}

export class CmsTokenProviderError extends Error {
  constructor(
    readonly code: 'auth' | 'upstream' | 'invalid_response',
    message: string,
  ) {
    super(message)
    this.name = 'CmsTokenProviderError'
  }
}

interface CmsTokenProviderOptions {
  config: PageBuilderCmsConfig
  fetchFn?: typeof fetch
  now?: () => number
  refreshSkewMs?: number
}

interface TokenPayload {
  access_token?: unknown
  expires_in?: unknown
  message?: unknown
  status?: unknown
}

class CmsTokenProvider implements CmsAuthorizationProvider {
  private readonly config: PageBuilderCmsConfig
  private readonly fetchFn: typeof fetch
  private readonly now: () => number
  private readonly refreshSkewMs: number
  private cachedAuthorizationHeader: string | null = null
  private expiresAt = 0
  private inflightRefresh: Promise<string> | null = null

  constructor(options: CmsTokenProviderOptions) {
    this.config = options.config
    this.fetchFn = options.fetchFn ?? fetch
    this.now = options.now ?? Date.now
    this.refreshSkewMs = options.refreshSkewMs ?? DEFAULT_REFRESH_SKEW_MS
  }

  async getAuthorizationHeader(): Promise<string> {
    if (this.cachedAuthorizationHeader && this.now() < this.expiresAt - this.refreshSkewMs) {
      logCmsTokenCacheHit({
        baseUrl: this.config.baseUrl,
        expiresAt: this.expiresAt,
      })
      return this.cachedAuthorizationHeader
    }

    if (!this.inflightRefresh) {
      this.inflightRefresh = this.refreshToken().finally(() => {
        this.inflightRefresh = null
      })
    }

    return this.inflightRefresh
  }

  invalidateAuthorizationHeader(): void {
    this.cachedAuthorizationHeader = null
    this.expiresAt = 0
  }

  private async refreshToken(): Promise<string> {
    const url = new URL(`${this.config.baseUrl}/api/token`)
    const requestHeaders = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
    const requestBody = JSON.stringify({
      username: this.config.username,
      password: this.config.password,
    })
    const startedAt = Date.now()
    let response: Response

    logCmsUpstreamRequestStart({
      operation: 'token_refresh',
      method: 'POST',
      url,
      requestHeaders,
      requestBody,
      startedAt,
    })

    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: requestHeaders,
        body: requestBody,
      })
    } catch (error) {
      logCmsUpstreamRequestFailure({
        operation: 'token_refresh',
        method: 'POST',
        url,
        requestHeaders,
        requestBody,
        startedAt,
        error,
      })
      throw new CmsTokenProviderError('upstream', buildCmsUpstreamFailureMessage({
        prefix: 'CMS Token 请求失败',
        url,
        error,
      }))
    }

    const rawText = await response.text()
    const payload = parseCmsJsonSafely(rawText)
    logCmsUpstreamResponse({
      operation: 'token_refresh',
      method: 'POST',
      url,
      requestHeaders,
      requestBody,
      startedAt,
      response,
      responseBody: rawText,
    })
    const status = payload && typeof payload === 'object'
      ? readNumber((payload as TokenPayload).status)
      : undefined
    const detail = extractCmsPayloadMessage(payload) || rawText

    if (response.status === 401 || response.status === 403 || looksLikeAuthFailure(payload, detail)) {
      throw new CmsTokenProviderError('auth', buildCmsUpstreamFailureMessage({
        prefix: 'CMS 鉴权失败',
        url,
        response,
        payload,
        rawText,
      }))
    }

    if (!response.ok) {
      throw new CmsTokenProviderError(
        'upstream',
        buildCmsUpstreamFailureMessage({
          prefix: 'CMS Token 请求失败',
          url,
          response,
          payload,
          rawText,
        }),
      )
    }

    if (status !== 1) {
      throw new CmsTokenProviderError(
        'upstream',
        buildCmsUpstreamFailureMessage({
          prefix: 'CMS Token 请求失败',
          url,
          response,
          payload,
          rawText,
          fallbackDetail: '上游返回了非成功状态',
        }),
      )
    }

    const record = asRecord(payload)
    const accessToken = readOptionalString(record?.access_token)
    const expiresInSeconds = readNumber(record?.expires_in)

    if (!accessToken || expiresInSeconds === undefined) {
      throw new CmsTokenProviderError('invalid_response', 'CMS Token 响应格式不正确')
    }

    this.cachedAuthorizationHeader = accessToken
    this.expiresAt = this.now() + (expiresInSeconds * 1000)

    return accessToken
  }
}

const sharedProvidersByFetch = new WeakMap<typeof fetch, Map<string, CmsAuthorizationProvider>>()

export function createCmsTokenProvider(options: CmsTokenProviderOptions): CmsAuthorizationProvider {
  return new CmsTokenProvider(options)
}

export function getSharedCmsTokenProvider(
  options: Pick<CmsTokenProviderOptions, 'config' | 'fetchFn'>,
): CmsAuthorizationProvider {
  const fetchFn = options.fetchFn ?? fetch
  const cacheKey = [
    options.config.baseUrl,
    options.config.username,
    options.config.password,
  ].join('\n')
  const scopedProviders = sharedProvidersByFetch.get(fetchFn) ?? new Map<string, CmsAuthorizationProvider>()

  if (!sharedProvidersByFetch.has(fetchFn)) {
    sharedProvidersByFetch.set(fetchFn, scopedProviders)
  }

  const existing = scopedProviders.get(cacheKey)
  if (existing) {
    return existing
  }

  const provider = createCmsTokenProvider(options)
  scopedProviders.set(cacheKey, provider)
  return provider
}

function looksLikeAuthFailure(payload: unknown, detail: string): boolean {
  const status = payload && typeof payload === 'object'
    ? readNumber((payload as TokenPayload).status)
    : undefined
  const combined = detail.toLowerCase()

  return status === 401
    || combined.includes('unauthorized')
    || combined.includes('not logged in')
    || combined.includes('login')
    || combined.includes('鉴权')
    || combined.includes('权限')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const next = value.trim()
    return next ? next : undefined
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return undefined
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return undefined
}
