import type { PageBuilderCmsConfig } from './page-builder-cms-config'

const DEFAULT_REFRESH_SKEW_MS = 30_000
const AUTH_FAILURE_MESSAGE = 'CMS 鉴权失败，请检查宿主配置中的账号密码是否正确'

export interface CmsAuthorizationProvider {
  getAuthorizationHeader(): Promise<string>
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
      return this.cachedAuthorizationHeader
    }

    if (!this.inflightRefresh) {
      this.inflightRefresh = this.refreshToken().finally(() => {
        this.inflightRefresh = null
      })
    }

    return this.inflightRefresh
  }

  private async refreshToken(): Promise<string> {
    const url = new URL(`${this.config.baseUrl}/api/token`)
    let response: Response

    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: this.config.username,
          password: this.config.password,
        }),
      })
    } catch (error) {
      const detail = sanitizeCmsErrorDetail(error instanceof Error ? error.message : String(error), this.config)
      throw new CmsTokenProviderError('upstream', detail ? `CMS Token 请求失败：${detail}` : 'CMS Token 请求失败')
    }

    const rawText = await response.text()
    const payload = parseJsonSafely(rawText)
    const status = payload && typeof payload === 'object'
      ? readNumber((payload as TokenPayload).status)
      : undefined
    const detail = sanitizeCmsErrorDetail(extractErrorMessage(payload) || rawText, this.config)

    if (response.status === 401 || response.status === 403 || looksLikeAuthFailure(payload, detail)) {
      throw new CmsTokenProviderError('auth', AUTH_FAILURE_MESSAGE)
    }

    if (!response.ok) {
      throw new CmsTokenProviderError(
        'upstream',
        detail ? `CMS Token 请求失败：${detail}` : `CMS Token 请求失败（HTTP ${response.status}）`,
      )
    }

    if (status !== 1) {
      throw new CmsTokenProviderError(
        'upstream',
        detail ? `CMS Token 请求失败：${detail}` : 'CMS Token 请求失败，上游返回了非成功状态',
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
    options.config.siteID,
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

function sanitizeCmsErrorDetail(detail: string, config: PageBuilderCmsConfig): string {
  const usernamePattern = escapeRegExp(config.username)
  const passwordPattern = escapeRegExp(config.password)

  return detail
    .replace(/authorization\s*[:=]?\s*bearer\s+[^\s,;]+/gi, 'authorization=[REDACTED]')
    .replace(/bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/username\s*[:=]\s*[^\s,;]+/gi, 'username=[REDACTED]')
    .replace(/password\s*[:=]\s*[^\s,;]+/gi, 'password=[REDACTED]')
    .replace(new RegExp(usernamePattern, 'gi'), '[REDACTED]')
    .replace(new RegExp(passwordPattern, 'gi'), '[REDACTED]')
    .trim()
}

function extractErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const record = payload as Record<string, unknown>
  const candidates = [
    record.message,
    record.msg,
    record.error,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return ''
}

function parseJsonSafely(value: string): unknown {
  if (!value.trim()) {
    return {}
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    return {}
  }
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
